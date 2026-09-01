import type { Db } from '@/server/db/client';
import { prisma } from '@/server/db/client';
import { hashIp } from '@/server/crypto';
import { redactPhonesInText } from '@/server/phone';

/**
 * Append-only record of consequential actions.
 *
 * There is deliberately no update or delete function in this module, and none
 * anywhere else in the codebase. If this log can be edited it is not evidence.
 */

export const AUDIT_ACTIONS = {
  // identity
  PERSON_REGISTERED: 'person.registered',
  PERSON_SIGNED_IN: 'person.signed_in',
  PERSON_SIGNED_OUT: 'person.signed_out',
  PERSON_UPDATED: 'person.updated',
  PERSON_SUSPENDED: 'person.suspended',
  PERSON_REINSTATED: 'person.reinstated',
  PERSON_ANONYMIZED: 'person.anonymized',
  PERSON_EXPORTED: 'person.exported',
  GOOGLE_LINKED: 'person.google_linked',
  GOOGLE_UNLINKED: 'person.google_unlinked',
  CONSENT_ACCEPTED: 'consent.accepted',
  OTP_SENT: 'otp.sent',
  OTP_VERIFIED: 'otp.verified',
  OTP_FAILED: 'otp.failed',

  // the centre of the product
  RECOMMENDATION_CREATED: 'recommendation.created',
  RECOMMENDATION_WITHDRAWN: 'recommendation.withdrawn',

  // third-party data
  CLAIM_INVITED: 'claim.invited',
  CLAIM_RESENT: 'claim.resent',
  CLAIM_ACCEPTED: 'claim.accepted',
  CLAIM_REJECTED: 'claim.rejected',
  CLAIM_EXPIRED: 'claim.expired',

  // marketplace
  REQUIREMENT_CREATED: 'requirement.created',
  REQUIREMENT_UPDATED: 'requirement.updated',
  REQUIREMENT_CLOSED: 'requirement.closed',
  REQUIREMENT_FILLED: 'requirement.filled',
  REQUIREMENT_EXPIRED: 'requirement.expired',
  CONTACT_REVEALED: 'contact.revealed',
  INTEREST_EXPRESSED: 'interest.expressed',
  INTEREST_UPDATED: 'interest.updated',
  ENGAGEMENT_RECORDED: 'engagement.recorded',

  // trust and oversight
  MEMBERSHIP_REQUESTED: 'membership.requested',
  MEMBERSHIP_VERIFIED: 'membership.verified',
  MEMBERSHIP_REVOKED: 'membership.revoked',
  CONTENT_REPORTED: 'content.reported',
  CONTENT_HIDDEN: 'content.hidden',
  CONTENT_RESTORED: 'content.restored',
  REPORT_RESOLVED: 'report.resolved',
  TAXONOMY_CHANGED: 'taxonomy.changed',
  ROLE_GRANTED: 'role.granted',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/** Request-scoped context, captured once per request by the API layer. */
export type RequestContext = {
  ip: string | null;
  userAgent: string | null;
};

export type AuditInput = {
  action: AuditAction;
  /** Internal id of the acting person; null for anonymous or system events. */
  actorPersonId?: bigint | null;
  entityType?: string;
  /** The PUBLIC id — this log must never contain an internal sequential id. */
  entityId?: string;
  metadata?: Record<string, unknown>;
  context?: RequestContext;
};

/**
 * Keys that must never be written to the audit log, however convenient.
 * The check is on the key name because that is what a future contributor will
 * reach for when adding a field in a hurry.
 */
const FORBIDDEN_METADATA_KEYS = new Set([
  'phone',
  'phoneNumber',
  'mobile',
  'msisdn',
  'otp',
  'code',
  'token',
  'password',
  'ip',
  'ipAddress',
]);

/**
 * Strip anything that looks like personal data out of metadata.
 *
 * Section 6 forbids plaintext PII in logs. Relying on every future call site
 * to remember that is not a control; doing it here is.
 */
export function sanitizeMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;

  const clean: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (FORBIDDEN_METADATA_KEYS.has(key)) {
      clean[key] = '[redacted]';
      continue;
    }
    if (typeof value === 'string') {
      // Catches a number pasted into a free-text field such as a note excerpt.
      clean[key] = redactPhonesInText(value);
      continue;
    }
    if (typeof value === 'bigint') {
      // An internal primary key would break JSON serialisation and should not
      // be here anyway — the log records public ids.
      clean[key] = '[internal-id-omitted]';
      continue;
    }
    if (value === null || ['number', 'boolean'].includes(typeof value)) {
      clean[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      clean[key] = value.map((item) =>
        typeof item === 'string' ? redactPhonesInText(item) : item,
      );
      continue;
    }
    if (typeof value === 'object') {
      clean[key] = sanitizeMetadata(value as Record<string, unknown>);
      continue;
    }
  }

  return clean;
}

/**
 * Write one audit event.
 *
 * Takes an optional `Db` so a caller can enlist the audit write in the same
 * transaction as the thing being audited — for a recommendation, the vouch and
 * its audit record must land together or not at all.
 */
export async function recordAudit(input: AuditInput, db: Db = prisma): Promise<void> {
  await db.auditEvent.create({
    data: {
      action: input.action,
      actorPersonId: input.actorPersonId ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      ipHash: hashIp(input.context?.ip),
      userAgent: input.context?.userAgent?.slice(0, 255) ?? null,
      metadata: (sanitizeMetadata(input.metadata) ?? null) as never,
    },
  });
}

/**
 * Write an audit event that must never take the request down with it.
 *
 * Used for read-side events (a contact reveal has already happened by the time
 * we log it). Write-side events use `recordAudit` inside the transaction so a
 * failure correctly rolls the whole thing back.
 */
export async function recordAuditSafely(input: AuditInput, db: Db = prisma): Promise<void> {
  try {
    await recordAudit(input, db);
  } catch (error) {
    console.error(
      `[audit] failed to record ${input.action}:`,
      error instanceof Error ? redactPhonesInText(error.message) : 'unknown error',
    );
  }
}
