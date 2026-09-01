import { prisma } from '@/server/db/client';
import { errors } from '@/server/errors';
import { newPublicId } from '@/server/ids';
import { AUDIT_ACTIONS, recordAudit } from '@/server/audit';
import { enforceRateLimit } from '@/server/ratelimit';
import { canModerate } from '@/server/domain/person/rules';
import { revokeAllSessions } from '@/server/auth/session';
import type { CurrentPerson, RequestMeta } from '@/server/auth/session';
import type {
  ReportReason,
  ReportStatus,
  ReportableEntity,
} from '@/server/domain/constants';

/**
 * Moderation.
 *
 * Minimal by design — the brief scopes the admin console to "moderate content,
 * verify members, manage taxonomy" and nothing more. There is no queue
 * automation, no scoring, no bulk tooling: at this size a person reads each
 * report.
 *
 * Hiding is always reversible and always audited. The one irreversible act in
 * the product is a subject rejecting their own claim, and that belongs to them.
 */

export type ReportView = {
  publicId: string;
  entityType: ReportableEntity;
  entityId: string;
  reason: ReportReason;
  detail: string | null;
  status: ReportStatus;
  reporterName: string | null;
  createdAt: string;
  /** A short description of the reported thing, so a moderator can triage. */
  subjectSummary: string | null;
  isHidden: boolean;
};

export async function submitReport(
  input: {
    entityType: ReportableEntity;
    entityId: string;
    reason: ReportReason;
    detail: string | null;
  },
  reporter: CurrentPerson | null,
  meta: RequestMeta,
): Promise<{ publicId: string }> {
  // Reporting is open to signed-out visitors: "my details are here without my
  // permission" is exactly the complaint somebody with no account needs to be
  // able to make.
  await enforceRateLimit('anonymousWrite', reporter?.publicId ?? (meta.ip ?? 'anonymous'));

  const publicId = newPublicId();

  await prisma.$transaction(async (tx) => {
    await tx.moderationReport.create({
      data: {
        publicId,
        reporterPersonId: reporter?.id ?? null,
        entityType: input.entityType,
        entityId: input.entityId,
        reason: input.reason,
        detail: input.detail,
        status: 'open',
      },
    });

    await recordAudit(
      {
        action: AUDIT_ACTIONS.CONTENT_REPORTED,
        actorPersonId: reporter?.id ?? null,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: { reason: input.reason },
        context: meta,
      },
      tx,
    );
  });

  return { publicId };
}

export async function listReports(
  status: ReportStatus,
  actor: CurrentPerson,
  locale: string,
): Promise<ReportView[]> {
  if (!canModerate(actor)) throw errors.forbidden();

  const rows = await prisma.moderationReport.findMany({
    where: { status },
    orderBy: { createdAt: 'asc' },
    take: 100,
    select: {
      publicId: true,
      entityType: true,
      entityId: true,
      reason: true,
      detail: true,
      status: true,
      createdAt: true,
      reporter: { select: { displayName: true } },
    },
  });

  // Resolve a human-readable summary per report. N+1 by construction, and
  // correct at this scale: a moderation queue is tens of rows read by one
  // person, and a union query would be far harder to follow.
  return Promise.all(
    rows.map(async (row) => {
      const { summary, isHidden } = await describeEntity(
        row.entityType as ReportableEntity,
        row.entityId,
        locale,
      );

      return {
        publicId: row.publicId,
        entityType: row.entityType as ReportableEntity,
        entityId: row.entityId,
        reason: row.reason as ReportReason,
        detail: row.detail,
        status: row.status as ReportStatus,
        reporterName: row.reporter?.displayName ?? null,
        createdAt: row.createdAt.toISOString(),
        subjectSummary: summary,
        isHidden,
      };
    }),
  );
}

async function describeEntity(
  entityType: ReportableEntity,
  entityId: string,
  _locale: string,
): Promise<{ summary: string | null; isHidden: boolean }> {
  switch (entityType) {
    case 'requirement': {
      const row = await prisma.requirement.findUnique({
        where: { publicId: entityId },
        select: { title: true, hiddenAt: true },
      });
      return { summary: row?.title ?? null, isHidden: row?.hiddenAt !== null };
    }
    case 'recommendation': {
      const row = await prisma.recommendation.findUnique({
        where: { publicId: entityId },
        select: { note: true, hiddenAt: true },
      });
      return {
        summary: row ? row.note.slice(0, 160) : null,
        isHidden: row?.hiddenAt !== null,
      };
    }
    case 'person': {
      const row = await prisma.person.findUnique({
        where: { publicId: entityId },
        select: { displayName: true, headline: true, status: true },
      });
      return {
        summary: row ? [row.displayName, row.headline].filter(Boolean).join(' — ') : null,
        isHidden: row?.status === 'suspended',
      };
    }
    default: {
      const unreachable: never = entityType;
      throw new Error(`Unhandled entity type: ${String(unreachable)}`);
    }
  }
}

/**
 * Hide or restore reported content.
 *
 * Hiding never deletes. A hidden requirement or recommendation keeps its row
 * and its history; it simply stops being displayed. That is what makes a
 * moderation mistake recoverable and keeps the audit trail whole.
 */
export async function setHidden(
  entityType: ReportableEntity,
  entityId: string,
  hidden: boolean,
  reason: string | null,
  actor: CurrentPerson,
  meta: RequestMeta,
): Promise<void> {
  if (!canModerate(actor)) throw errors.forbidden();

  const now = hidden ? new Date() : null;

  await prisma.$transaction(async (tx) => {
    switch (entityType) {
      case 'requirement':
        await tx.requirement.update({
          where: { publicId: entityId },
          data: { hiddenAt: now, hiddenReason: hidden ? reason : null },
        });
        break;

      case 'recommendation':
        await tx.recommendation.update({
          where: { publicId: entityId },
          data: { hiddenAt: now, hiddenReason: hidden ? reason : null },
        });
        break;

      case 'person': {
        // Suspending a person is heavier than hiding one item: it stops them
        // acting and hides everything of theirs, so their live sessions go too.
        await tx.person.update({
          where: { publicId: entityId },
          data: {
            status: hidden ? 'suspended' : 'active',
            suspendedAt: now,
          },
        });
        break;
      }

      default: {
        const unreachable: never = entityType;
        throw new Error(`Unhandled entity type: ${String(unreachable)}`);
      }
    }

    await recordAudit(
      {
        action: hidden ? AUDIT_ACTIONS.CONTENT_HIDDEN : AUDIT_ACTIONS.CONTENT_RESTORED,
        actorPersonId: actor.id,
        entityType,
        entityId,
        metadata: { hasReason: Boolean(reason) },
        context: meta,
      },
      tx,
    );
  });

  if (entityType === 'person' && hidden) {
    const person = await prisma.person.findUnique({
      where: { publicId: entityId },
      select: { id: true },
    });
    if (person) await revokeAllSessions(person.id);
  }
}

export async function resolveReport(
  publicId: string,
  status: Extract<ReportStatus, 'actioned' | 'dismissed'>,
  note: string | null,
  actor: CurrentPerson,
  meta: RequestMeta,
): Promise<void> {
  if (!canModerate(actor)) throw errors.forbidden();

  const report = await prisma.moderationReport.findUnique({
    where: { publicId },
    select: { id: true, status: true },
  });

  if (!report) throw errors.notFound();
  if (report.status !== 'open') throw errors.conflict('errors.validationFailed');

  await prisma.$transaction(async (tx) => {
    await tx.moderationReport.update({
      where: { id: report.id },
      data: {
        status,
        resolvedByPersonId: actor.id,
        resolvedAt: new Date(),
        resolutionNote: note,
      },
    });

    await recordAudit(
      {
        action: AUDIT_ACTIONS.REPORT_RESOLVED,
        actorPersonId: actor.id,
        entityType: 'moderation_report',
        entityId: publicId,
        metadata: { status },
        context: meta,
      },
      tx,
    );
  });
}

/** Counts for the console landing page. Section 4 rules out anything more. */
export async function getModerationCounts(
  actor: CurrentPerson,
): Promise<{ openReports: number; pendingMemberships: number }> {
  if (!canModerate(actor)) throw errors.forbidden();

  const [openReports, pendingMemberships] = await Promise.all([
    prisma.moderationReport.count({ where: { status: 'open' } }),
    prisma.anchorMembership.count({ where: { status: 'pending' } }),
  ]);

  return { openReports, pendingMemberships };
}
