import { prisma } from '@/server/db/client';
import { errors } from '@/server/errors';
import { newPublicId } from '@/server/ids';
import { AUDIT_ACTIONS, recordAudit } from '@/server/audit';
import { enforceRateLimit } from '@/server/ratelimit';
import { canAct } from '@/server/domain/person/rules';
import { acceptsInterest, type RequirementFacts } from '@/server/domain/requirement/rules';
import { listRecommendationsFor } from '@/server/services/recommendation.service';
import type { CurrentPerson, RequestMeta } from '@/server/auth/session';
import type {
  EngagementOutcome,
  InterestStatus,
  RequirementStatus,
} from '@/server/domain/constants';
import type { RecommendationView } from '@/server/services/recommendation.service';

/**
 * Expression of interest, and the outcome that may follow.
 *
 * The point of this pair, from the brief: when a candidate raises their hand,
 * the employer sees their profile INCLUDING its recommendations. That is the
 * moment the whole product exists for — a name attached to a vouch, at the
 * moment somebody is deciding whether to call.
 */

export type InterestedCandidate = {
  interestPublicId: string;
  status: InterestStatus;
  note: string | null;
  createdAt: string;
  person: {
    publicId: string;
    displayName: string;
    headline: string | null;
    localityLabel: string | null;
    isVerifiedMember: boolean;
    skills: string[];
  };
  /** The reason this feature exists. */
  recommendations: RecommendationView[];
  /** Set once an outcome has been recorded for this person on this posting. */
  engagementOutcome: EngagementOutcome | null;
};

export async function expressInterest(
  requirementPublicId: string,
  note: string | null,
  candidate: CurrentPerson,
  meta: RequestMeta,
): Promise<{ publicId: string }> {
  if (!canAct(candidate)) throw errors.forbidden();

  await enforceRateLimit('interestCreate', candidate.publicId);

  const requirement = await prisma.requirement.findUnique({
    where: { publicId: requirementPublicId },
    select: {
      id: true,
      postedByPersonId: true,
      status: true,
      expiresAt: true,
      hiddenAt: true,
    },
  });

  if (!requirement) throw errors.notFound();

  // An employer expressing interest in their own posting is meaningless and
  // would pollute the candidate list.
  if (requirement.postedByPersonId === candidate.id) {
    throw errors.invariant('errors.validationFailed');
  }

  const facts: RequirementFacts = {
    status: requirement.status as RequirementStatus,
    expiresAt: requirement.expiresAt,
    hiddenAt: requirement.hiddenAt,
    engagementCount: 0,
  };
  if (!acceptsInterest(facts)) throw errors.conflict('requirements.closed');

  const existing = await prisma.interest.findUnique({
    where: {
      requirementId_personId: { requirementId: requirement.id, personId: candidate.id },
    },
    select: { publicId: true, status: true },
  });

  if (existing) {
    // Re-expressing after withdrawing is reinstatement, not a duplicate.
    if (existing.status === 'withdrawn') {
      await prisma.interest.update({
        where: {
          requirementId_personId: { requirementId: requirement.id, personId: candidate.id },
        },
        data: { status: 'expressed', note },
      });
      return { publicId: existing.publicId };
    }
    throw errors.conflict('requirements.alreadyInterested');
  }

  const publicId = newPublicId();

  await prisma.$transaction(async (tx) => {
    await tx.interest.create({
      data: {
        publicId,
        requirementId: requirement.id,
        personId: candidate.id,
        status: 'expressed',
        note,
      },
    });

    await recordAudit(
      {
        action: AUDIT_ACTIONS.INTEREST_EXPRESSED,
        actorPersonId: candidate.id,
        entityType: 'requirement',
        entityId: requirementPublicId,
        context: meta,
      },
      tx,
    );
  });

  return { publicId };
}

/**
 * The employer's view of who has raised their hand.
 *
 * Each candidate comes with their recommendations attached. No phone numbers:
 * the employer reaches a candidate through the same audited reveal path as
 * everywhere else.
 */
export async function listInterestedCandidates(
  requirementPublicId: string,
  employer: CurrentPerson,
  locale: string,
): Promise<InterestedCandidate[]> {
  const requirement = await prisma.requirement.findUnique({
    where: { publicId: requirementPublicId },
    select: { id: true, postedByPersonId: true },
  });

  if (!requirement) throw errors.notFound();
  if (requirement.postedByPersonId !== employer.id) throw errors.forbidden();

  const rows = await prisma.interest.findMany({
    where: { requirementId: requirement.id, status: { not: 'withdrawn' } },
    orderBy: { createdAt: 'asc' },
    select: {
      publicId: true,
      status: true,
      note: true,
      createdAt: true,
      person: {
        select: {
          id: true,
          publicId: true,
          displayName: true,
          headline: true,
          status: true,
          anonymizedAt: true,
          locality: { select: { nameEn: true, nameMl: true } },
          anchorMemberships: {
            where: { status: 'verified' },
            select: { id: true },
            take: 1,
          },
          skills: {
            select: { category: { select: { nameEn: true, nameMl: true } } },
            take: 6,
          },
        },
      },
    },
  });

  const engagements = await prisma.engagement.findMany({
    where: { requirementId: requirement.id },
    select: { personId: true, outcome: true },
  });
  const outcomeByPerson = new Map(
    engagements.map((row) => [row.personId, row.outcome as EngagementOutcome]),
  );

  const visible = rows.filter(
    (row) => row.person.anonymizedAt === null && row.person.status === 'active',
  );

  return Promise.all(
    visible.map(async (row) => ({
      interestPublicId: row.publicId,
      status: row.status as InterestStatus,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
      person: {
        publicId: row.person.publicId,
        displayName: row.person.displayName,
        headline: row.person.headline,
        localityLabel: row.person.locality
          ? locale === 'ml'
            ? (row.person.locality.nameMl ?? row.person.locality.nameEn)
            : row.person.locality.nameEn
          : null,
        isVerifiedMember: row.person.anchorMemberships.length > 0,
        skills: row.person.skills.map((skill) =>
          locale === 'ml'
            ? (skill.category.nameMl ?? skill.category.nameEn)
            : skill.category.nameEn,
        ),
      },
      recommendations: await listRecommendationsFor(row.person.id, employer, locale),
      engagementOutcome: outcomeByPerson.get(row.person.id) ?? null,
    })),
  );
}

export async function updateInterestStatus(
  interestPublicId: string,
  status: InterestStatus,
  actor: CurrentPerson,
  meta: RequestMeta,
): Promise<void> {
  const interest = await prisma.interest.findUnique({
    where: { publicId: interestPublicId },
    select: {
      id: true,
      personId: true,
      requirement: { select: { publicId: true, postedByPersonId: true } },
    },
  });

  if (!interest) throw errors.notFound();

  const isEmployer = interest.requirement.postedByPersonId === actor.id;
  const isCandidate = interest.personId === actor.id;

  // The employer shortlists or declines; the candidate withdraws. Neither can
  // do the other's action.
  if (status === 'withdrawn' ? !isCandidate : !isEmployer) {
    throw errors.forbidden();
  }

  await prisma.$transaction(async (tx) => {
    await tx.interest.update({ where: { id: interest.id }, data: { status } });

    await recordAudit(
      {
        action: AUDIT_ACTIONS.INTEREST_UPDATED,
        actorPersonId: actor.id,
        entityType: 'requirement',
        entityId: interest.requirement.publicId,
        metadata: { status },
        context: meta,
      },
      tx,
    );
  });
}

/**
 * Record what actually happened.
 *
 * Captured now, computed from never. Stage 2 will build referrer credibility
 * on this, and it can only do that if collection starts today — which is why
 * recording an outcome is a first-class action rather than a side effect of
 * closing a posting.
 */
export async function recordEngagement(
  requirementPublicId: string,
  input: { personPublicId: string; outcome: EngagementOutcome; note: string | null },
  employer: CurrentPerson,
  meta: RequestMeta,
): Promise<{ publicId: string }> {
  const [requirement, person] = await Promise.all([
    prisma.requirement.findUnique({
      where: { publicId: requirementPublicId },
      select: { id: true, postedByPersonId: true },
    }),
    prisma.person.findUnique({
      where: { publicId: input.personPublicId },
      select: { id: true, status: true, anonymizedAt: true },
    }),
  ]);

  if (!requirement || !person) throw errors.notFound();
  if (requirement.postedByPersonId !== employer.id) throw errors.forbidden();
  if (person.anonymizedAt !== null) throw errors.notFound();

  // An employer cannot record an outcome against themselves.
  if (person.id === employer.id) throw errors.invariant('errors.validationFailed');

  const publicId = newPublicId();

  await prisma.$transaction(async (tx) => {
    await tx.engagement.upsert({
      where: {
        requirementId_personId: { requirementId: requirement.id, personId: person.id },
      },
      // Correcting an outcome is legitimate: "ongoing" becomes "completed".
      update: { outcome: input.outcome, note: input.note, recordedAt: new Date() },
      create: {
        publicId,
        requirementId: requirement.id,
        personId: person.id,
        outcome: input.outcome,
        note: input.note,
        recordedByPersonId: employer.id,
      },
    });

    await recordAudit(
      {
        action: AUDIT_ACTIONS.ENGAGEMENT_RECORDED,
        actorPersonId: employer.id,
        entityType: 'requirement',
        entityId: requirementPublicId,
        metadata: { outcome: input.outcome, personPublicId: input.personPublicId },
        context: meta,
      },
      tx,
    );
  });

  return { publicId };
}

/** The postings a candidate has raised their hand for. */
export async function listOwnInterests(
  candidate: CurrentPerson,
  locale: string,
): Promise<
  Array<{
    interestPublicId: string;
    status: InterestStatus;
    requirementPublicId: string;
    title: string;
    localityLabel: string;
    requirementStatus: RequirementStatus;
    createdAt: string;
  }>
> {
  const rows = await prisma.interest.findMany({
    where: { personId: candidate.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      publicId: true,
      status: true,
      createdAt: true,
      requirement: {
        select: {
          publicId: true,
          title: true,
          status: true,
          locality: { select: { nameEn: true, nameMl: true } },
        },
      },
    },
  });

  return rows.map((row) => ({
    interestPublicId: row.publicId,
    status: row.status as InterestStatus,
    requirementPublicId: row.requirement.publicId,
    title: row.requirement.title,
    localityLabel:
      locale === 'ml'
        ? (row.requirement.locality.nameMl ?? row.requirement.locality.nameEn)
        : row.requirement.locality.nameEn,
    requirementStatus: row.requirement.status as RequirementStatus,
    createdAt: row.createdAt.toISOString(),
  }));
}
