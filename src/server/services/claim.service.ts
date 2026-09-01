import { prisma } from '@/server/db/client';
import { errors } from '@/server/errors';
import { hashIp, hashToken } from '@/server/crypto';
import { maskPhone } from '@/server/phone';
import { AUDIT_ACTIONS, recordAudit } from '@/server/audit';
import { enforceRateLimit } from '@/server/ratelimit';
import { sendOtp, verifyOtp } from '@/server/services/auth.service';
import { createSession, type RequestMeta } from '@/server/auth/session';
import { CURRENT_CONSENT_VERSION } from '@/server/consent/versions';
import type { RelationshipContext } from '@/server/domain/constants';

/**
 * The claim flow.
 *
 * A referrer entered somebody else's name and number. That person was not
 * present and agreed to nothing. This module is how they get the final say,
 * and it is the most legally consequential path in the product.
 *
 * The shape of it:
 *
 *   1. The subject exists as `pending_claim`: not listed, not searchable, not
 *      contactable. Nothing about them is visible to anyone.
 *   2. They receive a link naming the referrer and quoting what was written.
 *   3. Opening the link shows them exactly that, before they decide anything.
 *   4. Deciding requires an OTP to their number, so only the real owner of the
 *      number can accept or reject.
 *   5. Accept → the profile becomes public. Reject → their personal data is
 *      deleted and that referrer is blocked from re-adding them.
 *   6. No decision within the window → expired and purged automatically.
 *
 * Step 3 matters as much as step 5: consent that is not informed is not
 * consent, so the page must show who and what before it asks.
 */

export type ClaimPreview = {
  /** Masked, so an intercepted link does not disclose the full number. */
  maskedPhone: string;
  subjectName: string;
  referrerName: string;
  referrerIsVerifiedMember: boolean;
  relationshipContext: RelationshipContext | null;
  note: string | null;
  expiresAt: string;
};

async function findInvitation(token: string) {
  const invitation = await prisma.claimInvitation.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      status: true,
      expiresAt: true,
      personId: true,
      person: {
        select: {
          publicId: true,
          displayName: true,
          phone: true,
          status: true,
          createdByPersonId: true,
        },
      },
      recommendation: {
        select: {
          note: true,
          relationshipContext: true,
          referrer: {
            select: {
              displayName: true,
              anchorMemberships: {
                where: { status: 'verified' },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  if (!invitation) throw errors.notFound('claim.invalid');
  if (invitation.status !== 'pending') throw errors.conflict('claim.invalid');
  if (invitation.expiresAt <= new Date()) throw errors.conflict('claim.expired');

  return invitation;
}

/**
 * What the subject sees before deciding.
 *
 * Deliberately shows the referrer's name and the note verbatim. Hiding either
 * would make the decision uninformed, and the note is the thing they are
 * actually being asked to agree to have published about them.
 */
export async function getClaimPreview(token: string): Promise<ClaimPreview> {
  const invitation = await findInvitation(token);

  return {
    maskedPhone: invitation.person.phone ? maskPhone(invitation.person.phone) : '',
    subjectName: invitation.person.displayName,
    referrerName: invitation.recommendation?.referrer.displayName ?? '',
    referrerIsVerifiedMember:
      (invitation.recommendation?.referrer.anchorMemberships.length ?? 0) > 0,
    relationshipContext:
      (invitation.recommendation?.relationshipContext as RelationshipContext) ?? null,
    note: invitation.recommendation?.note ?? null,
    expiresAt: invitation.expiresAt.toISOString(),
  };
}

/**
 * Send the one-time password that authorises a claim decision.
 *
 * Without this, anyone who obtained the link — a forwarded SMS, a shared
 * phone — could accept or reject on the subject's behalf. The link proves
 * someone received the message; the code proves they hold the number.
 */
export async function requestClaimOtp(
  token: string,
): Promise<{ maskedPhone: string; devCode?: string }> {
  const invitation = await findInvitation(token);
  if (!invitation.person.phone) throw errors.notFound('claim.invalid');

  await enforceRateLimit('claimResend', invitation.person.publicId);

  const result = await sendOtp(invitation.person.phone, 'claim', {
    ip: null,
    userAgent: null,
  });

  await prisma.claimInvitation.update({
    where: { id: invitation.id },
    data: { sentCount: { increment: 1 }, lastSentAt: new Date() },
  });

  return {
    maskedPhone: result.maskedPhone,
    ...(result.devCode !== undefined ? { devCode: result.devCode } : {}),
  };
}

export type ClaimDecisionInput = {
  token: string;
  code: string;
  decision: 'accept' | 'reject';
  /** The subject may correct the name the referrer entered for them. */
  displayName?: string | undefined;
  locale: string;
};

export type ClaimDecisionResult = {
  decision: 'accept' | 'reject';
  personPublicId: string | null;
};

/**
 * Accept or reject.
 *
 * Accepting records consent and signs the person in — they have just proved
 * control of the number, and making them log in again immediately afterwards
 * would be friction with no security benefit.
 *
 * Rejecting purges their personal data and blocks the referrer. It is
 * deliberately as easy as accepting: a one-tap refusal that leaves nothing
 * behind is the difference between asking permission and merely notifying.
 */
export async function decideClaim(
  input: ClaimDecisionInput,
  meta: RequestMeta,
): Promise<ClaimDecisionResult> {
  const invitation = await findInvitation(input.token);
  const phone = invitation.person.phone;
  if (!phone) throw errors.notFound('claim.invalid');

  await verifyOtp(phone, input.code, 'claim', meta);

  if (input.decision === 'reject') {
    await rejectClaim(invitation.id, invitation.personId, invitation.person.createdByPersonId, meta);
    return { decision: 'reject', personPublicId: null };
  }

  await prisma.$transaction(async (tx) => {
    await tx.person.update({
      where: { id: invitation.personId },
      data: {
        status: 'active',
        claimedAt: new Date(),
        ...(input.displayName ? { displayName: input.displayName.trim() } : {}),
      },
    });

    await tx.claimInvitation.update({
      where: { id: invitation.id },
      data: { status: 'claimed', claimedAt: new Date() },
    });

    // Any other outstanding invitations for the same person are satisfied too:
    // two referrers may have recommended them independently, and they should
    // not have to accept twice.
    await tx.claimInvitation.updateMany({
      where: { personId: invitation.personId, status: 'pending' },
      data: { status: 'claimed', claimedAt: new Date() },
    });

    await tx.consentRecord.create({
      data: {
        personId: invitation.personId,
        consentVersion: CURRENT_CONSENT_VERSION,
        // Distinct from 'registration': this person arrived because somebody
        // else entered their details, and the record should say so.
        purpose: 'recommendation_subject',
        locale: input.locale,
        ipHash: hashIp(meta.ip),
      },
    });

    await recordAudit(
      {
        action: AUDIT_ACTIONS.CLAIM_ACCEPTED,
        actorPersonId: invitation.personId,
        entityType: 'person',
        entityId: invitation.person.publicId,
        metadata: { consentVersion: CURRENT_CONSENT_VERSION, locale: input.locale },
        context: meta,
      },
      tx,
    );
  });

  await createSession(invitation.personId, meta);

  return { decision: 'accept', personPublicId: invitation.person.publicId };
}

/**
 * The subject said no.
 *
 * Their personal data is removed immediately, every recommendation about them
 * is withdrawn, and the referrer who added them is blocked from doing it
 * again. The Person row survives, anonymised, so the audit trail stays intact
 * — we need to be able to show that somebody was added and that they refused.
 */
async function rejectClaim(
  invitationId: bigint,
  personId: bigint,
  createdByPersonId: bigint | null,
  meta: RequestMeta,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const person = await tx.person.findUniqueOrThrow({
      where: { id: personId },
      select: { publicId: true },
    });

    const referrerIds = await tx.recommendation.findMany({
      where: { subjectPersonId: personId, status: 'active' },
      select: { referrerPersonId: true },
    });

    await tx.recommendation.updateMany({
      where: { subjectPersonId: personId, status: 'active' },
      data: {
        status: 'withdrawn',
        withdrawnAt: new Date(),
        withdrawnReason: 'subject_rejected',
        activeSubjectKey: null,
      },
    });

    // Block every referrer who had written about them, not only the one who
    // created the row — refusing the profile means refusing all of it.
    const blockedIds = new Set<bigint>(referrerIds.map((row) => row.referrerPersonId));
    if (createdByPersonId !== null) blockedIds.add(createdByPersonId);

    if (blockedIds.size > 0) {
      await tx.recommendationBlock.createMany({
        data: [...blockedIds].map((referrerPersonId) => ({
          subjectPersonId: personId,
          referrerPersonId,
        })),
        skipDuplicates: true,
      });
    }

    await tx.claimInvitation.updateMany({
      where: { personId, status: 'pending' },
      data: { status: 'rejected', rejectedAt: new Date() },
    });

    // Purge the personal data. Phone goes to NULL — the unique index permits
    // many NULLs, and nulling it is also what stops the same referrer
    // recreating the row by entering the number again.
    await tx.person.update({
      where: { id: personId },
      data: {
        phone: null,
        displayName: 'Removed account',
        headline: null,
        localityId: null,
        anonymizedAt: new Date(),
        status: 'suspended',
      },
    });

    await recordAudit(
      {
        action: AUDIT_ACTIONS.CLAIM_REJECTED,
        actorPersonId: personId,
        entityType: 'person',
        entityId: person.publicId,
        metadata: { blockedReferrers: blockedIds.size, invitationId: String(invitationId) },
        context: meta,
      },
      tx,
    );
  });
}

/**
 * Expire unclaimed profiles and purge their personal data.
 *
 * Section 6 requires this, and it is the control that makes the whole
 * third-party-data model defensible: somebody who never responded ends up with
 * nothing of theirs retained. Run from the maintenance endpoint.
 */
export async function expireUnclaimedProfiles(): Promise<number> {
  const now = new Date();

  const stale = await prisma.claimInvitation.findMany({
    where: { status: 'pending', expiresAt: { lte: now } },
    select: { id: true, personId: true, person: { select: { publicId: true, status: true } } },
    take: 500,
  });

  let purged = 0;

  for (const invitation of stale) {
    // Only ever touches a profile the person never claimed. Somebody who
    // registered in the meantime is already `active` and must be left alone.
    if (invitation.person.status !== 'pending_claim') {
      await prisma.claimInvitation.update({
        where: { id: invitation.id },
        data: { status: 'expired' },
      });
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.claimInvitation.update({
        where: { id: invitation.id },
        data: { status: 'expired' },
      });

      await tx.recommendation.updateMany({
        where: { subjectPersonId: invitation.personId, status: 'active' },
        data: {
          status: 'withdrawn',
          withdrawnAt: now,
          withdrawnReason: 'claim_expired',
          activeSubjectKey: null,
        },
      });

      await tx.person.update({
        where: { id: invitation.personId },
        data: {
          phone: null,
          displayName: 'Removed account',
          headline: null,
          localityId: null,
          anonymizedAt: now,
        },
      });

      await recordAudit(
        {
          action: AUDIT_ACTIONS.CLAIM_EXPIRED,
          entityType: 'person',
          entityId: invitation.person.publicId,
          metadata: { reason: 'unclaimed_window_elapsed' },
        },
        tx,
      );
    });

    purged += 1;
  }

  if (purged > 0) {
    console.warn(`[claim] purged ${purged} unclaimed profile(s)`);
  }

  return purged;
}
