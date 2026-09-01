import type { Db } from '@/server/db/client';
import { prisma } from '@/server/db/client';
import { env } from '@/server/env';
import { errors } from '@/server/errors';
import { newPublicId } from '@/server/ids';
import { generateToken, hashToken } from '@/server/crypto';
import { maskPhone } from '@/server/phone';
import { AUDIT_ACTIONS, recordAudit } from '@/server/audit';
import { enforceRateLimit } from '@/server/ratelimit';
import { getSmsSender } from '@/server/sms';
import {
  assertCanCreateRecommendation,
  assertCanWithdraw,
  assertValidNote,
} from '@/server/domain/recommendation/rules';
import { categoryLabel, resolveCategoryId } from '@/server/services/category.service';
import type { CurrentPerson, RequestMeta } from '@/server/auth/session';
import type { PersonStatus, RelationshipContext } from '@/server/domain/constants';

/**
 * Recommendations, and the claim flow that makes them lawful.
 *
 * This is the heart of Koode and the most legally consequential code in it.
 * The thing to hold on to: when a referrer names somebody who is not yet a
 * user, they are submitting a third party's personal data without that person
 * present. Everything below exists to make sure that person, not the referrer
 * and not us, decides what happens next.
 */

/**
 * How long an unclaimed profile survives before it and its personal data are
 * purged.
 *
 * PRODUCT DECISION, PENDING CONFIRMATION (ARCHITECTURE.md §Open decisions).
 */
export const CLAIM_WINDOW_DAYS = 30;

export type RecommendationView = {
  publicId: string;
  note: string;
  relationshipContext: RelationshipContext;
  categoryLabel: string | null;
  createdAt: string;
  referrer: {
    publicId: string;
    displayName: string;
    isVerifiedMember: boolean;
    localityLabel: string | null;
  };
  /** True when the viewer wrote it, so the UI can offer withdrawal. */
  isOwn: boolean;
};

export type CreateRecommendationInput = {
  /** An existing Koode user… */
  subjectPublicId?: string | undefined;
  /** …or somebody not on Koode yet. */
  subjectPhone?: string | undefined;
  subjectName?: string | undefined;
  relationshipContext: RelationshipContext;
  categoryPublicId?: string | null | undefined;
  note: string;
};

export type CreateRecommendationResult = {
  publicId: string;
  /** Set when a pending_claim profile was created and an invitation sent. */
  invitedSubject: { maskedPhone: string; displayName: string } | null;
};

/**
 * Find or create the person being recommended.
 *
 * Two paths, with very different consequences:
 *
 *  - by public id: an existing user. Nothing new is disclosed.
 *  - by phone: possibly somebody who has never heard of Koode. This creates a
 *    `pending_claim` row — invisible, unsearchable, uncontactable — and is
 *    gated by ALLOW_RECOMMENDING_NON_USERS, because the claim invitation is
 *    what protects them and it cannot be delivered without a real SMS
 *    provider.
 */
async function resolveSubject(
  input: CreateRecommendationInput,
  referrerId: bigint,
  db: Db,
): Promise<{ id: bigint; publicId: string; status: PersonStatus; wasCreated: boolean }> {
  if (input.subjectPublicId) {
    const subject = await db.person.findUnique({
      where: { publicId: input.subjectPublicId },
      select: { id: true, publicId: true, status: true },
    });
    if (!subject) throw errors.notFound();

    return { ...(subject as { id: bigint; publicId: string }), status: subject.status as PersonStatus, wasCreated: false };
  }

  if (!input.subjectPhone || !input.subjectName) {
    throw errors.validation();
  }

  const existing = await db.person.findUnique({
    where: { phone: input.subjectPhone },
    select: { id: true, publicId: true, status: true },
  });

  if (existing) {
    return {
      id: existing.id,
      publicId: existing.publicId,
      status: existing.status as PersonStatus,
      wasCreated: false,
    };
  }

  // Creating a person from somebody else's phone number. Fail closed unless
  // this has been deliberately enabled with a working SMS provider.
  if (!env.ALLOW_RECOMMENDING_NON_USERS) {
    throw errors.capabilityDisabled('errors.recommendingNonUsersDisabled');
  }

  const publicId = newPublicId();
  const created = await db.person.create({
    data: {
      publicId,
      phone: input.subjectPhone,
      displayName: input.subjectName.trim(),
      // Not listed, not searchable, not contactable until they claim it.
      status: 'pending_claim',
      createdByPersonId: referrerId,
    },
    select: { id: true },
  });

  return { id: created.id, publicId, status: 'pending_claim', wasCreated: true };
}

/**
 * Write a recommendation.
 *
 * Everything happens in one transaction: the vouch, the claim invitation and
 * the audit record land together or not at all. A recommendation that exists
 * without its invitation would be personal data held with no route to consent.
 */
export async function createRecommendation(
  input: CreateRecommendationInput,
  referrer: CurrentPerson,
  meta: RequestMeta,
): Promise<CreateRecommendationResult> {
  assertValidNote(input.note);
  await enforceRateLimit('recommendationCreate', referrer.publicId);

  const categoryId = input.categoryPublicId
    ? await resolveCategoryId(input.categoryPublicId)
    : null;

  const outcome = await prisma.$transaction(async (tx) => {
    const subject = await resolveSubject(input, referrer.id, tx);

    const [existing, block, subjectRow] = await Promise.all([
      tx.recommendation.findFirst({
        where: { referrerPersonId: referrer.id, subjectPersonId: subject.id },
        orderBy: { createdAt: 'desc' },
        select: { status: true },
      }),
      tx.recommendationBlock.findUnique({
        where: {
          subjectPersonId_referrerPersonId: {
            subjectPersonId: subject.id,
            referrerPersonId: referrer.id,
          },
        },
        select: { id: true },
      }),
      tx.person.findUniqueOrThrow({
        where: { id: subject.id },
        select: { anonymizedAt: true, displayName: true, phone: true },
      }),
    ]);

    assertCanCreateRecommendation({
      referrerId: referrer.id,
      referrer,
      subject: {
        id: subject.id,
        status: subject.status,
        anonymizedAt: subjectRow.anonymizedAt,
      },
      existing: existing ? { status: existing.status as 'active' | 'withdrawn' } : null,
      isBlocked: block !== null,
    });

    const publicId = newPublicId();

    await tx.recommendation.create({
      data: {
        publicId,
        referrerPersonId: referrer.id,
        subjectPersonId: subject.id,
        note: input.note.trim(),
        relationshipContext: input.relationshipContext,
        categoryId,
        status: 'active',
        // Mirrors subjectPersonId while active. This is what makes the unique
        // index enforce one-active-per-pair — see prisma/schema.prisma.
        activeSubjectKey: subject.id,
      },
    });

    // Somebody who is already active has consented and is simply told about
    // the new recommendation; only a pending_claim profile needs an invitation.
    let invitation: { token: string; expiresAt: Date } | null = null;

    if (subject.status === 'pending_claim') {
      const token = generateToken(32);
      const expiresAt = new Date(Date.now() + CLAIM_WINDOW_DAYS * 24 * 60 * 60 * 1000);

      await tx.claimInvitation.create({
        data: {
          publicId: newPublicId(),
          personId: subject.id,
          tokenHash: hashToken(token),
          status: 'pending',
          expiresAt,
          sentCount: 1,
          lastSentAt: new Date(),
        },
      });

      invitation = { token, expiresAt };
    }

    await recordAudit(
      {
        action: AUDIT_ACTIONS.RECOMMENDATION_CREATED,
        actorPersonId: referrer.id,
        entityType: 'recommendation',
        entityId: publicId,
        metadata: {
          subjectPublicId: subject.publicId,
          subjectWasCreated: subject.wasCreated,
          relationshipContext: input.relationshipContext,
        },
        context: meta,
      },
      tx,
    );

    if (invitation) {
      await recordAudit(
        {
          action: AUDIT_ACTIONS.CLAIM_INVITED,
          actorPersonId: referrer.id,
          entityType: 'person',
          entityId: subject.publicId,
          context: meta,
        },
        tx,
      );
    }

    return {
      publicId,
      invitation,
      subjectPhone: subjectRow.phone,
      subjectName: subjectRow.displayName,
      needsInvite: subject.status === 'pending_claim',
    };
  });

  // Sent after the transaction commits: an SMS cannot be rolled back, and
  // messaging somebody about a recommendation that failed to save would be
  // worse than a missing message.
  if (outcome.invitation && outcome.subjectPhone) {
    const link = `${env.NEXT_PUBLIC_APP_URL}/claim/${outcome.invitation.token}`;

    await getSmsSender().send({
      to: outcome.subjectPhone,
      kind: 'claim_invitation',
      // Names the referrer, because the person has a right to know who put
      // their details in, and offers a way out in the message itself.
      body:
        `${referrer.displayName} has recommended you on Koode, a local work platform. ` +
        `Your details are not shown to anyone until you agree. ` +
        `Accept or remove them here: ${link}`,
    });
  }

  return {
    publicId: outcome.publicId,
    invitedSubject:
      outcome.needsInvite && outcome.subjectPhone
        ? { maskedPhone: maskPhone(outcome.subjectPhone), displayName: outcome.subjectName }
        : null,
  };
}

/**
 * Withdraw a recommendation.
 *
 * Soft: the row stays, `status` becomes `withdrawn`, and `activeSubjectKey` is
 * nulled so the unique index will admit a replacement. History is retained
 * because a change of mind is itself part of the record.
 */
export async function withdrawRecommendation(
  publicId: string,
  reason: string | undefined,
  actor: CurrentPerson,
  meta: RequestMeta,
): Promise<void> {
  const row = await prisma.recommendation.findUnique({
    where: { publicId },
    select: { id: true, referrerPersonId: true, status: true },
  });

  if (!row) throw errors.notFound();

  assertCanWithdraw(
    { referrerPersonId: row.referrerPersonId, status: row.status as 'active' | 'withdrawn' },
    actor.id,
  );

  await prisma.$transaction(async (tx) => {
    await tx.recommendation.update({
      where: { id: row.id },
      data: {
        status: 'withdrawn',
        withdrawnAt: new Date(),
        withdrawnReason: reason ?? null,
        // Releases the pair so the referrer can write a corrected one.
        activeSubjectKey: null,
      },
    });

    await recordAudit(
      {
        action: AUDIT_ACTIONS.RECOMMENDATION_WITHDRAWN,
        actorPersonId: actor.id,
        entityType: 'recommendation',
        entityId: publicId,
        metadata: { hasReason: Boolean(reason) },
        context: meta,
      },
      tx,
    );
  });
}

/** The recommendations shown on a person's profile. */
export async function listRecommendationsFor(
  subjectId: bigint,
  viewer: CurrentPerson | null,
  locale: string,
): Promise<RecommendationView[]> {
  const rows = await prisma.recommendation.findMany({
    where: { subjectPersonId: subjectId, status: 'active', hiddenAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      publicId: true,
      note: true,
      relationshipContext: true,
      createdAt: true,
      referrerPersonId: true,
      category: { select: { nameEn: true, nameMl: true } },
      referrer: {
        // No phone. A recommendation names its author; it does not expose them.
        select: {
          publicId: true,
          displayName: true,
          anonymizedAt: true,
          locality: { select: { nameEn: true, nameMl: true } },
          anchorMemberships: {
            where: { status: 'verified' },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });

  return rows.map((row) => ({
    publicId: row.publicId,
    note: row.note,
    relationshipContext: row.relationshipContext as RelationshipContext,
    categoryLabel: row.category ? categoryLabel(row.category, locale) : null,
    createdAt: row.createdAt.toISOString(),
    referrer: {
      publicId: row.referrer.publicId,
      displayName: row.referrer.anonymizedAt ? '—' : row.referrer.displayName,
      isVerifiedMember: row.referrer.anchorMemberships.length > 0,
      localityLabel: row.referrer.locality
        ? locale === 'ml'
          ? (row.referrer.locality.nameMl ?? row.referrer.locality.nameEn)
          : row.referrer.locality.nameEn
        : null,
    },
    isOwn: viewer !== null && viewer.id === row.referrerPersonId,
  }));
}

export type FeaturedVouch = {
  note: string;
  createdAt: string;
  referrerName: string;
  referrerIsVerifiedMember: boolean;
  subjectName: string;
  subjectPublicId: string;
  categoryLabel: string | null;
};

/**
 * The freshest vouches, for the home page.
 *
 * The landing page's job is to show what Koode actually is, and what it is is
 * this: a named person's word about somebody, on the record. Real rows, never
 * marketing copy — which also means the section simply disappears while the
 * platform is too young to have any, which is more honest than a placeholder.
 *
 * Only fully public edges qualify: active recommendation, active claimed
 * subject, no anonymised party. No phone numbers are anywhere near this query.
 */
export async function getFeaturedVouches(
  limit: number,
  locale: string,
): Promise<FeaturedVouch[]> {
  const rows = await prisma.recommendation.findMany({
    where: {
      status: 'active',
      hiddenAt: null,
      subject: { status: 'active', anonymizedAt: null },
      referrer: { anonymizedAt: null },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      note: true,
      createdAt: true,
      category: { select: { nameEn: true, nameMl: true } },
      subject: { select: { publicId: true, displayName: true } },
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
  });

  return rows.map((row) => ({
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    referrerName: row.referrer.displayName,
    referrerIsVerifiedMember: row.referrer.anchorMemberships.length > 0,
    subjectName: row.subject.displayName,
    subjectPublicId: row.subject.publicId,
    categoryLabel: row.category ? categoryLabel(row.category, locale) : null,
  }));
}

/** Recommendations this person has written, for their own profile page. */
export async function listRecommendationsBy(
  referrerId: bigint,
  locale: string,
): Promise<Array<RecommendationView & { subjectName: string; subjectPublicId: string }>> {
  const rows = await prisma.recommendation.findMany({
    where: { referrerPersonId: referrerId, status: 'active' },
    orderBy: { createdAt: 'desc' },
    select: {
      publicId: true,
      note: true,
      relationshipContext: true,
      createdAt: true,
      category: { select: { nameEn: true, nameMl: true } },
      subject: {
        select: { publicId: true, displayName: true, status: true, anonymizedAt: true },
      },
    },
  });

  return rows.map((row) => ({
    publicId: row.publicId,
    note: row.note,
    relationshipContext: row.relationshipContext as RelationshipContext,
    categoryLabel: row.category ? categoryLabel(row.category, locale) : null,
    createdAt: row.createdAt.toISOString(),
    referrer: {
      publicId: '',
      displayName: '',
      isVerifiedMember: false,
      localityLabel: null,
    },
    isOwn: true,
    subjectPublicId: row.subject.publicId,
    subjectName: row.subject.anonymizedAt ? '—' : row.subject.displayName,
  }));
}
