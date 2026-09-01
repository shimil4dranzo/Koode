import { prisma } from '@/server/db/client';
import { errors } from '@/server/errors';
import { AUDIT_ACTIONS, recordAudit } from '@/server/audit';
import { canAct, canAdminister } from '@/server/domain/person/rules';
import type { CurrentPerson, RequestMeta } from '@/server/auth/session';
import type { AnchorOrgType, MembershipStatus } from '@/server/domain/constants';

/**
 * Anchor organisations and membership verification.
 *
 * An anchor is a local institution whose word already means something —
 * the merchants' association, a civic club. Membership of one is what the
 * "verified member" badge attests, and the badge is the only trust signal
 * Koode displays. There are deliberately no stars and no scores: the brief
 * rules out anonymous ratings, and a badge that says "this person is who they
 * say they are, according to an organisation that knows them" is a different
 * and more honest claim than a number.
 *
 * Who may verify: an office-bearer of the SAME organisation, or a platform
 * admin. Not a moderator — moderation is about content, membership is about
 * the association's own records, and conflating them would let Koode staff
 * vouch for people the association has never heard of.
 */

export type AnchorOrgRef = {
  publicId: string;
  name: string;
  type: AnchorOrgType;
  localityLabel: string;
};

export type MembershipView = {
  personPublicId: string;
  displayName: string;
  localityLabel: string | null;
  status: MembershipStatus;
  role: string;
  membershipRef: string | null;
  requestedAt: string;
  verifiedAt: string | null;
  verifiedByName: string | null;
};

export async function listAnchorOrgs(locale: string): Promise<AnchorOrgRef[]> {
  const rows = await prisma.anchorOrg.findMany({
    where: { isActive: true },
    orderBy: { nameEn: 'asc' },
    select: {
      publicId: true,
      nameEn: true,
      nameMl: true,
      type: true,
      locality: { select: { nameEn: true, nameMl: true } },
    },
  });

  return rows.map((row) => ({
    publicId: row.publicId,
    name: locale === 'ml' ? (row.nameMl ?? row.nameEn) : row.nameEn,
    type: row.type as AnchorOrgType,
    localityLabel:
      locale === 'ml' ? (row.locality.nameMl ?? row.locality.nameEn) : row.locality.nameEn,
  }));
}

/** A person asks an organisation to confirm they belong to it. */
export async function requestMembership(
  anchorOrgPublicId: string,
  membershipRef: string | null,
  person: CurrentPerson,
  meta: RequestMeta,
): Promise<void> {
  if (!canAct(person)) throw errors.forbidden();

  const org = await prisma.anchorOrg.findUnique({
    where: { publicId: anchorOrgPublicId },
    select: { id: true, isActive: true },
  });
  if (!org || !org.isActive) throw errors.notFound();

  const existing = await prisma.anchorMembership.findUnique({
    where: {
      personId_anchorOrgId: { personId: person.id, anchorOrgId: org.id },
    },
    select: { status: true },
  });

  if (existing?.status === 'verified') throw errors.conflict('anchor.verified');

  await prisma.$transaction(async (tx) => {
    await tx.anchorMembership.upsert({
      where: { personId_anchorOrgId: { personId: person.id, anchorOrgId: org.id } },
      // A revoked membership can be requested again — people rejoin.
      update: { status: 'pending', membershipRef, revokedAt: null, revokedReason: null },
      create: {
        personId: person.id,
        anchorOrgId: org.id,
        status: 'pending',
        role: 'member',
        membershipRef,
      },
    });

    await recordAudit(
      {
        action: AUDIT_ACTIONS.MEMBERSHIP_REQUESTED,
        actorPersonId: person.id,
        entityType: 'anchor_org',
        entityId: anchorOrgPublicId,
        context: meta,
      },
      tx,
    );
  });
}

/**
 * May this person verify memberships of that organisation?
 *
 * An office-bearer of the same org, or a platform admin. Checked here rather
 * than at the route so the answer is identical for a Route Handler, a Server
 * Action and a future bot.
 */
async function assertCanVerify(
  actor: CurrentPerson,
  anchorOrgId: bigint,
): Promise<void> {
  if (canAdminister(actor)) return;

  const membership = await prisma.anchorMembership.findUnique({
    where: { personId_anchorOrgId: { personId: actor.id, anchorOrgId } },
    select: { role: true, status: true },
  });

  if (membership?.status !== 'verified' || membership.role !== 'office_bearer') {
    throw errors.forbidden();
  }
}

export async function listMemberships(
  anchorOrgPublicId: string,
  status: MembershipStatus | undefined,
  actor: CurrentPerson,
  locale: string,
): Promise<MembershipView[]> {
  const org = await prisma.anchorOrg.findUnique({
    where: { publicId: anchorOrgPublicId },
    select: { id: true },
  });
  if (!org) throw errors.notFound();

  await assertCanVerify(actor, org.id);

  const rows = await prisma.anchorMembership.findMany({
    where: { anchorOrgId: org.id, ...(status ? { status } : {}) },
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    take: 200,
    select: {
      status: true,
      role: true,
      membershipRef: true,
      createdAt: true,
      verifiedAt: true,
      verifiedBy: { select: { displayName: true } },
      person: {
        // No phone: an office-bearer verifying membership does not need one,
        // and if they want to ring the person they use the same audited
        // reveal path as everybody else.
        select: {
          publicId: true,
          displayName: true,
          locality: { select: { nameEn: true, nameMl: true } },
        },
      },
    },
  });

  return rows.map((row) => ({
    personPublicId: row.person.publicId,
    displayName: row.person.displayName,
    localityLabel: row.person.locality
      ? locale === 'ml'
        ? (row.person.locality.nameMl ?? row.person.locality.nameEn)
        : row.person.locality.nameEn
      : null,
    status: row.status as MembershipStatus,
    role: row.role,
    membershipRef: row.membershipRef,
    requestedAt: row.createdAt.toISOString(),
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    verifiedByName: row.verifiedBy?.displayName ?? null,
  }));
}

export async function verifyMembership(
  anchorOrgPublicId: string,
  personPublicId: string,
  actor: CurrentPerson,
  meta: RequestMeta,
): Promise<void> {
  const [org, person] = await Promise.all([
    prisma.anchorOrg.findUnique({
      where: { publicId: anchorOrgPublicId },
      select: { id: true },
    }),
    prisma.person.findUnique({
      where: { publicId: personPublicId },
      select: { id: true, status: true },
    }),
  ]);

  if (!org || !person) throw errors.notFound();
  await assertCanVerify(actor, org.id);

  // Verifying yourself would defeat the point of a second person attesting.
  if (person.id === actor.id) throw errors.invariant('errors.notAllowed');
  if (person.status !== 'active') throw errors.invariant('errors.profileNotClaimed');

  await prisma.$transaction(async (tx) => {
    await tx.anchorMembership.update({
      where: { personId_anchorOrgId: { personId: person.id, anchorOrgId: org.id } },
      data: {
        status: 'verified',
        verifiedByPersonId: actor.id,
        verifiedAt: new Date(),
        revokedAt: null,
        revokedReason: null,
      },
    });

    await recordAudit(
      {
        action: AUDIT_ACTIONS.MEMBERSHIP_VERIFIED,
        actorPersonId: actor.id,
        entityType: 'person',
        entityId: personPublicId,
        metadata: { anchorOrgPublicId },
        context: meta,
      },
      tx,
    );
  });
}

export async function revokeMembership(
  anchorOrgPublicId: string,
  personPublicId: string,
  reason: string | null,
  actor: CurrentPerson,
  meta: RequestMeta,
): Promise<void> {
  const [org, person] = await Promise.all([
    prisma.anchorOrg.findUnique({
      where: { publicId: anchorOrgPublicId },
      select: { id: true },
    }),
    prisma.person.findUnique({ where: { publicId: personPublicId }, select: { id: true } }),
  ]);

  if (!org || !person) throw errors.notFound();
  await assertCanVerify(actor, org.id);

  await prisma.$transaction(async (tx) => {
    await tx.anchorMembership.update({
      where: { personId_anchorOrgId: { personId: person.id, anchorOrgId: org.id } },
      data: { status: 'revoked', revokedAt: new Date(), revokedReason: reason },
    });

    // Recommendations already written are NOT touched. They were made in good
    // faith and carry the referrer's name; retroactively erasing them because
    // a membership lapsed would rewrite history.
    await recordAudit(
      {
        action: AUDIT_ACTIONS.MEMBERSHIP_REVOKED,
        actorPersonId: actor.id,
        entityType: 'person',
        entityId: personPublicId,
        metadata: { anchorOrgPublicId, hasReason: Boolean(reason) },
        context: meta,
      },
      tx,
    );
  });
}

/** The organisations this person may verify members for. */
export async function listOrgsActorCanVerify(
  actor: CurrentPerson,
  locale: string,
): Promise<AnchorOrgRef[]> {
  if (canAdminister(actor)) return listAnchorOrgs(locale);

  const memberships = await prisma.anchorMembership.findMany({
    where: { personId: actor.id, status: 'verified', role: 'office_bearer' },
    select: {
      anchorOrg: {
        select: {
          publicId: true,
          nameEn: true,
          nameMl: true,
          type: true,
          locality: { select: { nameEn: true, nameMl: true } },
        },
      },
    },
  });

  return memberships.map(({ anchorOrg }) => ({
    publicId: anchorOrg.publicId,
    name: locale === 'ml' ? (anchorOrg.nameMl ?? anchorOrg.nameEn) : anchorOrg.nameEn,
    type: anchorOrg.type as AnchorOrgType,
    localityLabel:
      locale === 'ml'
        ? (anchorOrg.locality.nameMl ?? anchorOrg.locality.nameEn)
        : anchorOrg.locality.nameEn,
  }));
}
