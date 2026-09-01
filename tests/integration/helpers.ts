import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { createId } from '@paralleldrive/cuid2';
import { parseMysqlUrl } from '@/server/db/connection-url';

/**
 * Integration-test plumbing.
 *
 * These tests talk to a real MySQL 8 because several of the invariants that
 * matter are enforced by database constraints. A mocked client would let a
 * broken unique index pass.
 */

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? '';
export const hasDatabase = TEST_DATABASE_URL.length > 0;

let client: PrismaClient | undefined;

export function db(): PrismaClient {
  if (!hasDatabase) {
    throw new Error('TEST_DATABASE_URL is not set — this suite should have been skipped.');
  }
  client ??= new PrismaClient({
    adapter: new PrismaMariaDb({ ...parseMysqlUrl(TEST_DATABASE_URL), timezone: 'Z' }),
  });
  return client;
}

export async function disconnect(): Promise<void> {
  await client?.$disconnect();
  client = undefined;
}

/**
 * Empty every table, children first.
 *
 * TRUNCATE would be faster but needs the foreign keys disabled, and disabling
 * them in a test suite that exists to verify constraints is exactly the wrong
 * habit to build.
 */
export async function resetDatabase(): Promise<void> {
  const prisma = db();

  await prisma.auditEvent.deleteMany();
  await prisma.moderationReport.deleteMany();
  await prisma.engagement.deleteMany();
  await prisma.interest.deleteMany();
  await prisma.claimInvitation.deleteMany();
  await prisma.recommendationBlock.deleteMany();
  await prisma.recommendation.deleteMany();
  await prisma.requirement.deleteMany();
  await prisma.anchorMembership.deleteMany();
  await prisma.anchorOrg.deleteMany();
  await prisma.personSkill.deleteMany();
  await prisma.consentRecord.deleteMany();
  await prisma.session.deleteMany();
  await prisma.otpChallenge.deleteMany();
  await prisma.person.deleteMany();
  await prisma.localityAdjacency.deleteMany();

  // Locality and Category are self-referential, so a flat deleteMany can try
  // to remove a parent while its children still point at it. Delete children
  // first: roles before tiers, and deepest localities before their ancestors.
  await prisma.category.deleteMany({ where: { level: 'role' } });
  await prisma.category.deleteMany({ where: { level: 'tier' } });

  const deepest = await prisma.locality.aggregate({ _max: { depth: true } });
  for (let depth = deepest._max.depth ?? 0; depth >= 0; depth -= 1) {
    await prisma.locality.deleteMany({ where: { depth } });
  }
}

let phoneCounter = 0;

/** A unique, valid Indian mobile number for each call. */
export function nextPhone(): string {
  phoneCounter += 1;
  return `+9198${String(46_000_000 + phoneCounter).padStart(8, '0')}`;
}

export async function makePerson(
  overrides: {
    displayName?: string;
    status?: string;
    phone?: string | null;
    localityId?: bigint | null;
    createdByPersonId?: bigint | null;
  } = {},
) {
  return db().person.create({
    data: {
      publicId: createId(),
      phone: overrides.phone === undefined ? nextPhone() : overrides.phone,
      // Malayalam by default, so every integration test also exercises the
      // charset end to end rather than only in the dedicated check.
      displayName: overrides.displayName ?? 'സുരേഷ് കുമാർ',
      status: overrides.status ?? 'active',
      localityId: overrides.localityId ?? null,
      createdByPersonId: overrides.createdByPersonId ?? null,
      claimedAt: new Date(),
    },
  });
}

export async function makeLocality(
  nameEn: string,
  parent?: { id: bigint; path: string; depth: number },
) {
  const prisma = db();
  const created = await prisma.locality.create({
    data: {
      publicId: createId(),
      level: parent ? 'ward' : 'panchayat',
      nameEn,
      nameMl: 'എടക്കര',
      parentId: parent?.id ?? null,
      depth: parent ? parent.depth + 1 : 0,
      path: '',
    },
  });

  return prisma.locality.update({
    where: { id: created.id },
    data: { path: `${parent?.path ?? '/'}${created.id}/` },
  });
}

export async function makeCategory(slug: string, parentId?: bigint) {
  return db().category.create({
    data: {
      publicId: createId(),
      slug,
      level: parentId ? 'role' : 'tier',
      nameEn: slug,
      nameMl: 'ഇലക്ട്രീഷ്യൻ',
      parentId: parentId ?? null,
      sortOrder: 1,
    },
  });
}
