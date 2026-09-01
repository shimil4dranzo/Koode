import { prisma } from '@/server/db/client';
import { errors } from '@/server/errors';
import { AUDIT_ACTIONS, recordAudit } from '@/server/audit';
import { maskPhone } from '@/server/phone';
import { revokeAllSessions } from '@/server/auth/session';
import { isPubliclyVisible } from '@/server/domain/person/rules';
import { ANONYMISED_DISPLAY_NAME } from '@/server/domain/person/rules';
import { listRecommendationsFor } from '@/server/services/recommendation.service';
import { resolveCategoryId } from '@/server/services/category.service';
import { resolveLocalityId } from '@/server/services/locality.service';
import type { CurrentPerson, RequestMeta } from '@/server/auth/session';
import type { PersonStatus } from '@/server/domain/constants';
import type { RecommendationView } from '@/server/services/recommendation.service';

/**
 * Profiles, plus the two rights the DPDP Act 2023 requires us to honour from
 * day one: export what we hold, and delete it.
 *
 * As everywhere else in this codebase, no function here returns a phone number
 * except the export, which returns it only to the person it belongs to.
 */

export type PublicProfile = {
  publicId: string;
  displayName: string;
  headline: string | null;
  localityLabel: string | null;
  isVerifiedMember: boolean;
  memberOf: string[];
  skills: Array<{
    categoryPublicId: string;
    label: string;
    yearsExperience: number | null;
    qualificationNote: string | null;
  }>;
  recommendations: RecommendationView[];
  isSelf: boolean;
};

export async function getPublicProfile(
  publicId: string,
  viewer: CurrentPerson | null,
  locale: string,
): Promise<PublicProfile> {
  const person = await prisma.person.findUnique({
    where: { publicId },
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
        select: { anchorOrg: { select: { nameEn: true, nameMl: true } } },
      },
      skills: {
        select: {
          yearsExperience: true,
          qualificationNote: true,
          category: { select: { publicId: true, nameEn: true, nameMl: true } },
        },
      },
    },
  });

  if (!person) throw errors.notFound();

  const isSelf = viewer !== null && viewer.id === person.id;

  // A `pending_claim` profile is invisible to everyone — this is the guard
  // that makes third-party data entry lawful. The person themselves has no
  // profile to view yet either; they are on the claim page instead.
  if (
    !isSelf &&
    !isPubliclyVisible({
      status: person.status as PersonStatus,
      anonymizedAt: person.anonymizedAt,
    })
  ) {
    throw errors.notFound();
  }

  return {
    publicId: person.publicId,
    displayName: person.displayName,
    headline: person.headline,
    localityLabel: person.locality
      ? locale === 'ml'
        ? (person.locality.nameMl ?? person.locality.nameEn)
        : person.locality.nameEn
      : null,
    isVerifiedMember: person.anchorMemberships.length > 0,
    memberOf: person.anchorMemberships.map((membership) =>
      locale === 'ml'
        ? (membership.anchorOrg.nameMl ?? membership.anchorOrg.nameEn)
        : membership.anchorOrg.nameEn,
    ),
    skills: person.skills.map((skill) => ({
      categoryPublicId: skill.category.publicId,
      label:
        locale === 'ml'
          ? (skill.category.nameMl ?? skill.category.nameEn)
          : skill.category.nameEn,
      yearsExperience: skill.yearsExperience,
      qualificationNote: skill.qualificationNote,
    })),
    recommendations: await listRecommendationsFor(person.id, viewer, locale),
    isSelf,
  };
}

export type UpdateProfileInput = {
  displayName?: string | undefined;
  localityPublicId?: string | null | undefined;
  headline?: string | null | undefined;
};

export async function updateProfile(
  input: UpdateProfileInput,
  person: CurrentPerson,
  meta: RequestMeta,
): Promise<void> {
  const localityId =
    input.localityPublicId === undefined
      ? undefined
      : input.localityPublicId === null
        ? null
        : await resolveLocalityId(input.localityPublicId);

  await prisma.$transaction(async (tx) => {
    await tx.person.update({
      where: { id: person.id },
      data: {
        ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
        ...(localityId !== undefined ? { localityId } : {}),
        ...(input.headline !== undefined ? { headline: input.headline?.trim() || null } : {}),
      },
    });

    await recordAudit(
      {
        action: AUDIT_ACTIONS.PERSON_UPDATED,
        actorPersonId: person.id,
        entityType: 'person',
        entityId: person.publicId,
        metadata: { fields: Object.keys(input) },
        context: meta,
      },
      tx,
    );
  });
}

export async function setSkill(
  input: {
    categoryPublicId: string;
    yearsExperience: number | null;
    qualificationNote: string | null;
  },
  person: CurrentPerson,
): Promise<void> {
  const categoryId = await resolveCategoryId(input.categoryPublicId);

  await prisma.personSkill.upsert({
    where: { personId_categoryId: { personId: person.id, categoryId } },
    update: {
      yearsExperience: input.yearsExperience,
      qualificationNote: input.qualificationNote,
    },
    create: {
      personId: person.id,
      categoryId,
      yearsExperience: input.yearsExperience,
      qualificationNote: input.qualificationNote,
    },
  });
}

export async function removeSkill(
  categoryPublicId: string,
  person: CurrentPerson,
): Promise<void> {
  const categoryId = await resolveCategoryId(categoryPublicId);

  await prisma.personSkill.deleteMany({
    where: { personId: person.id, categoryId },
  });
}

/**
 * Everything Koode holds about one person, for them to download.
 *
 * Returned to that person only. It includes their phone number in full —
 * refusing to show somebody their own number would be absurd — and every
 * recommendation written about them, because "who said what about me" is
 * exactly the thing a subject-access right exists to answer.
 */
export async function exportPersonalData(
  person: CurrentPerson,
  meta: RequestMeta,
): Promise<Record<string, unknown>> {
  const row = await prisma.person.findUniqueOrThrow({
    where: { id: person.id },
    select: {
      publicId: true,
      phone: true,
      displayName: true,
      headline: true,
      status: true,
      createdAt: true,
      claimedAt: true,
      locality: { select: { nameEn: true, nameMl: true } },
      createdBy: { select: { displayName: true } },
      consents: {
        select: { consentVersion: true, purpose: true, locale: true, acceptedAt: true },
      },
      skills: {
        select: {
          yearsExperience: true,
          qualificationNote: true,
          category: { select: { nameEn: true } },
        },
      },
      anchorMemberships: {
        select: {
          status: true,
          role: true,
          verifiedAt: true,
          anchorOrg: { select: { nameEn: true } },
        },
      },
      recommendationsReceived: {
        select: {
          note: true,
          relationshipContext: true,
          status: true,
          createdAt: true,
          referrer: { select: { displayName: true } },
        },
      },
      recommendationsGiven: {
        select: {
          note: true,
          relationshipContext: true,
          status: true,
          createdAt: true,
          subject: { select: { displayName: true } },
        },
      },
      requirementsPosted: {
        select: { title: true, status: true, createdAt: true },
      },
      interests: {
        select: {
          status: true,
          createdAt: true,
          requirement: { select: { title: true } },
        },
      },
      engagements: {
        select: {
          outcome: true,
          recordedAt: true,
          requirement: { select: { title: true } },
        },
      },
    },
  });

  await recordAudit({
    action: AUDIT_ACTIONS.PERSON_EXPORTED,
    actorPersonId: person.id,
    entityType: 'person',
    entityId: person.publicId,
    context: meta,
  });

  return {
    exportedAt: new Date().toISOString(),
    // Stated plainly, because the point of an export is to be understood.
    aboutThisFile:
      'Everything Koode holds about you. Recommendations written about you are ' +
      'included in full, with the name of the person who wrote each one.',
    profile: {
      id: row.publicId,
      phone: row.phone,
      name: row.displayName,
      headline: row.headline,
      status: row.status,
      locality: row.locality?.nameEn ?? null,
      addedBy: row.createdBy?.displayName ?? 'self-registered',
      registeredAt: row.createdAt.toISOString(),
      claimedAt: row.claimedAt?.toISOString() ?? null,
    },
    consents: row.consents.map((consent) => ({
      version: consent.consentVersion,
      purpose: consent.purpose,
      language: consent.locale,
      acceptedAt: consent.acceptedAt.toISOString(),
    })),
    skills: row.skills.map((skill) => ({
      work: skill.category.nameEn,
      yearsExperience: skill.yearsExperience,
      qualification: skill.qualificationNote,
    })),
    memberships: row.anchorMemberships.map((membership) => ({
      organisation: membership.anchorOrg.nameEn,
      role: membership.role,
      status: membership.status,
      verifiedAt: membership.verifiedAt?.toISOString() ?? null,
    })),
    recommendationsAboutYou: row.recommendationsReceived.map((rec) => ({
      writtenBy: rec.referrer.displayName,
      relationship: rec.relationshipContext,
      note: rec.note,
      status: rec.status,
      writtenAt: rec.createdAt.toISOString(),
    })),
    recommendationsYouWrote: row.recommendationsGiven.map((rec) => ({
      about: rec.subject.displayName,
      relationship: rec.relationshipContext,
      note: rec.note,
      status: rec.status,
      writtenAt: rec.createdAt.toISOString(),
    })),
    requirementsPosted: row.requirementsPosted.map((requirement) => ({
      title: requirement.title,
      status: requirement.status,
      postedAt: requirement.createdAt.toISOString(),
    })),
    interestsExpressed: row.interests.map((interest) => ({
      requirement: interest.requirement.title,
      status: interest.status,
      at: interest.createdAt.toISOString(),
    })),
    workOutcomes: row.engagements.map((engagement) => ({
      requirement: engagement.requirement.title,
      outcome: engagement.outcome,
      recordedAt: engagement.recordedAt.toISOString(),
    })),
  };
}

/**
 * Delete an account.
 *
 * Anonymises rather than cascading. The Person row and its edges survive with
 * every identifying column nulled, so:
 *
 *  - recommendation history stays statistically intact for Stage 2 without
 *    identifying anyone
 *  - the audit trail does not develop holes
 *  - a requirement that was filled still records that it was filled
 *
 * What is destroyed: the phone number, name, headline, locality, and every
 * recommendation this person WROTE (those are their words, and withdrawing
 * them is part of leaving). Recommendations written ABOUT them are retained in
 * anonymised form, because they are somebody else's statement.
 */
export async function deleteAccount(
  person: CurrentPerson,
  meta: RequestMeta,
): Promise<void> {
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.recommendation.updateMany({
      where: { referrerPersonId: person.id, status: 'active' },
      data: {
        status: 'withdrawn',
        withdrawnAt: now,
        withdrawnReason: 'author_deleted_account',
        activeSubjectKey: null,
      },
    });

    // Open postings must not outlive the account that can be contacted about
    // them.
    await tx.requirement.updateMany({
      where: { postedByPersonId: person.id, status: 'open' },
      data: { status: 'closed', closedAt: now },
    });

    await tx.personSkill.deleteMany({ where: { personId: person.id } });

    await tx.person.update({
      where: { id: person.id },
      data: {
        phone: null,
        displayName: ANONYMISED_DISPLAY_NAME,
        headline: null,
        localityId: null,
        anonymizedAt: now,
      },
    });

    await recordAudit(
      {
        action: AUDIT_ACTIONS.PERSON_ANONYMIZED,
        actorPersonId: person.id,
        entityType: 'person',
        entityId: person.publicId,
        metadata: { initiatedBy: 'self' },
        context: meta,
      },
      tx,
    );
  });

  await revokeAllSessions(person.id);
}

/** Shown on the person's own settings page so they can check the number on file. */
export async function getOwnMaskedPhone(person: CurrentPerson): Promise<string> {
  const row = await prisma.person.findUniqueOrThrow({
    where: { id: person.id },
    select: { phone: true },
  });

  return row.phone ? maskPhone(row.phone) : '';
}
