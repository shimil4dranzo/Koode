import { prisma } from '@/server/db/client';
import { errors } from '@/server/errors';
import { newPublicId } from '@/server/ids';
import { AUDIT_ACTIONS, recordAudit } from '@/server/audit';
import { enforceRateLimit } from '@/server/ratelimit';
import { canAct, isContactable } from '@/server/domain/person/rules';
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
    /**
     * Whether one of the candidate's listed kinds of work is the kind this
     * posting asks for — the same role, or the tier it belongs to. This is
     * the "smart matching" the launch plan promises, stated honestly: a
     * category comparison, not a model. It is a flag beside the name, not a
     * sort order, because an employer reading the recommendations should
     * still decide for themselves.
     */
    skillsMatch: boolean;
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
    select: {
      id: true,
      postedByPersonId: true,
      category: { select: { id: true, parentId: true } },
    },
  });

  if (!requirement) throw errors.notFound();
  if (requirement.postedByPersonId !== employer.id) throw errors.forbidden();

  // A skill counts as a match if it names this posting's role, or the tier
  // that role sits in ("skilled trades" matches an electrician posting).
  const wanted = new Set<bigint>([requirement.category.id]);
  if (requirement.category.parentId !== null) wanted.add(requirement.category.parentId);

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
            select: { categoryId: true, category: { select: { nameEn: true, nameMl: true } } },
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
        skillsMatch: row.person.skills.some((skill) => wanted.has(skill.categoryId)),
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

export type CandidateContact = {
  displayName: string;
  phone: string | null;
  contactEmail: string | null;
};

/**
 * Show an employer how to reach a candidate they have shortlisted.
 *
 * This is the "direct contact" step of the launch plan, and it is the one
 * place a job seeker's details flow to somebody else — so it is narrow on
 * purpose:
 *
 *  - Only the person who posted the opening, and only for a candidate on
 *    THAT opening. An employer cannot look up anyone who ever applied to
 *    anything.
 *  - Only once the candidate is shortlisted. Applying is a low-commitment tap;
 *    it must not hand out a phone number to every poster somebody tapped on.
 *    Shortlisting is the employer saying "I want to talk to this person",
 *    and that is the moment the details become useful.
 *  - Rate-limited on the employer's account with the same bucket as the
 *    public reveal, and written to the audit log before anything is returned,
 *    so a reveal cannot happen unlogged. The candidate's dashboard shows it.
 *
 * Nothing here is a permission the seeker granted per-employer: applying to
 * an opening is consenting to be contacted about it, and the privacy notice
 * says so.
 */
export async function revealCandidateContact(
  interestPublicId: string,
  employer: CurrentPerson,
  meta: RequestMeta,
): Promise<CandidateContact> {
  if (!canAct(employer)) throw errors.forbidden();

  await enforceRateLimit('contactReveal', employer.publicId);

  const interest = await prisma.interest.findUnique({
    where: { publicId: interestPublicId },
    select: {
      id: true,
      status: true,
      requirement: { select: { postedByPersonId: true } },
      person: {
        select: {
          id: true,
          publicId: true,
          displayName: true,
          status: true,
          anonymizedAt: true,
          phone: true,
          contactEmail: true,
        },
      },
    },
  });

  if (!interest) throw errors.notFound();
  if (interest.requirement.postedByPersonId !== employer.id) throw errors.forbidden();
  if (interest.status !== 'shortlisted') throw errors.invariant('errors.notAllowed');

  const candidate = interest.person;
  if (
    !isContactable({ status: candidate.status as never, anonymizedAt: candidate.anonymizedAt })
  ) {
    throw errors.notFound();
  }

  await recordAudit({
    action: AUDIT_ACTIONS.CANDIDATE_CONTACT_REVEALED,
    actorPersonId: employer.id,
    entityType: 'interest',
    entityId: interestPublicId,
    metadata: { candidatePublicId: candidate.publicId },
    context: meta,
  });

  return {
    displayName: candidate.displayName,
    phone: candidate.phone,
    contactEmail: candidate.contactEmail,
  };
}
