/**
 * Seed the database.
 *
 * Idempotent: safe to run repeatedly against the same database. Reference data
 * (localities, categories, the anchor org) is upserted by its natural key;
 * sample people are created only when the table is empty, so re-seeding a
 * development database never duplicates them and never touches a real one.
 *
 *   npm run db:seed
 *
 * Sample people, requirements and recommendations are DEVELOPMENT ONLY and are
 * skipped entirely when NODE_ENV=production.
 */
import '../scripts/load-env.ts';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { createId } from '@paralleldrive/cuid2';
import { parseMysqlUrl } from '../src/server/db/connection-url.ts';
import {
  SEED_ADJACENCIES,
  SEED_ANCHOR_ORGS,
  SEED_CATEGORIES,
  SEED_LOCALITIES,
} from './seed-data.ts';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env.local first.');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb({ ...parseMysqlUrl(url), timezone: 'Z' }),
});

/** Maps a seed-file key to the database id it was given. */
type KeyMap = Map<string, bigint>;

async function seedLocalities(): Promise<KeyMap> {
  const ids: KeyMap = new Map();
  const paths = new Map<string, string>();

  // SEED_LOCALITIES is ordered parents-before-children, so a parent's path is
  // always known by the time a child needs it.
  for (const locality of SEED_LOCALITIES) {
    const parentId = locality.parentKey ? ids.get(locality.parentKey) : null;
    const parentPath = locality.parentKey ? paths.get(locality.parentKey) : '/';

    if (locality.parentKey && (parentId === undefined || parentPath === undefined)) {
      throw new Error(
        `Locality "${locality.key}" references parent "${locality.parentKey}", which is not defined above it.`,
      );
    }

    const depth = locality.parentKey ? (parentPath as string).split('/').length - 2 : 0;

    // Upsert by name + parent, since the seed key is not stored in the table.
    const existing = await prisma.locality.findFirst({
      where: { nameEn: locality.nameEn, parentId: parentId ?? null },
      select: { id: true },
    });

    const row = existing
      ? await prisma.locality.update({
          where: { id: existing.id },
          data: {
            level: locality.level,
            nameMl: locality.nameMl,
            depth,
            isActive: true,
          },
          select: { id: true },
        })
      : await prisma.locality.create({
          data: {
            publicId: createId(),
            level: locality.level,
            nameEn: locality.nameEn,
            nameMl: locality.nameMl,
            parentId: parentId ?? null,
            depth,
            path: '', // set immediately below, once the id exists
          },
          select: { id: true },
        });

    const path = `${parentPath ?? '/'}${row.id}/`;
    await prisma.locality.update({ where: { id: row.id }, data: { path } });

    ids.set(locality.key, row.id);
    paths.set(locality.key, path);
  }

  console.log(`  localities   : ${ids.size}`);
  return ids;
}

async function seedAdjacencies(localityIds: KeyMap): Promise<void> {
  // Stored in both directions so a "nearby" query is one index lookup rather
  // than an OR across two columns.
  const rows = SEED_ADJACENCIES.flatMap((pair) => {
    const a = localityIds.get(pair.aKey);
    const b = localityIds.get(pair.bKey);
    if (a === undefined || b === undefined) {
      throw new Error(`Adjacency references an unknown locality: ${pair.aKey} / ${pair.bKey}`);
    }
    return [
      { localityId: a, neighbourId: b },
      { localityId: b, neighbourId: a },
    ];
  });

  const { count } = await prisma.localityAdjacency.createMany({
    data: rows,
    skipDuplicates: true,
  });

  console.log(`  adjacency    : ${SEED_ADJACENCIES.length} pairs (${count} new edges)`);
}

async function seedCategories(): Promise<Map<string, bigint>> {
  const ids = new Map<string, bigint>();

  // Tiers first: a role's parent must exist before the role is written.
  const ordered = [...SEED_CATEGORIES].sort((a, b) =>
    a.level === b.level ? 0 : a.level === 'tier' ? -1 : 1,
  );

  for (const category of ordered) {
    const parentId = category.parentSlug ? ids.get(category.parentSlug) : null;
    if (category.parentSlug && parentId === undefined) {
      throw new Error(
        `Category "${category.slug}" references parent tier "${category.parentSlug}", which was not seeded.`,
      );
    }

    const row = await prisma.category.upsert({
      where: { slug: category.slug },
      update: {
        level: category.level,
        nameEn: category.nameEn,
        nameMl: category.nameMl,
        parentId: parentId ?? null,
        sortOrder: category.sortOrder,
        isActive: true,
      },
      create: {
        publicId: createId(),
        slug: category.slug,
        level: category.level,
        nameEn: category.nameEn,
        nameMl: category.nameMl,
        parentId: parentId ?? null,
        sortOrder: category.sortOrder,
      },
      select: { id: true },
    });

    ids.set(category.slug, row.id);
  }

  const tiers = SEED_CATEGORIES.filter((c) => c.level === 'tier').length;
  console.log(`  categories   : ${ids.size} (${tiers} tiers, ${ids.size - tiers} roles)`);
  return ids;
}

async function seedAnchorOrgs(localityIds: KeyMap): Promise<bigint> {
  let firstId: bigint | null = null;

  for (const org of SEED_ANCHOR_ORGS) {
    const localityId = localityIds.get(org.localityKey);
    if (localityId === undefined) {
      throw new Error(`Anchor org "${org.nameEn}" references unknown locality "${org.localityKey}"`);
    }

    const existing = await prisma.anchorOrg.findFirst({
      where: { nameEn: org.nameEn },
      select: { id: true },
    });

    const row = existing
      ? await prisma.anchorOrg.update({
          where: { id: existing.id },
          data: { nameMl: org.nameMl, type: org.type, localityId, isActive: true },
          select: { id: true },
        })
      : await prisma.anchorOrg.create({
          data: {
            publicId: createId(),
            nameEn: org.nameEn,
            nameMl: org.nameMl,
            type: org.type,
            localityId,
          },
          select: { id: true },
        });

    firstId ??= row.id;
  }

  console.log(`  anchor orgs  : ${SEED_ANCHOR_ORGS.length}`);
  if (firstId === null) throw new Error('No anchor org seeded');
  return firstId;
}

/**
 * Grant the platform admin role to the numbers in SEED_ADMIN_PHONES.
 *
 * These people must already have registered — this promotes an existing
 * account rather than creating one, so nobody gets an admin account they never
 * signed up for.
 */
async function grantSeedAdmins(): Promise<void> {
  const phones = (process.env.SEED_ADMIN_PHONES ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (phones.length === 0) return;

  const { count } = await prisma.person.updateMany({
    where: { phone: { in: phones } },
    data: { platformRole: 'admin' },
  });

  console.log(`  admins       : ${count} of ${phones.length} requested (must already exist)`);
}

/**
 * Development-only sample data.
 *
 * Spans all four tiers deliberately — a loading worker, an electrician, a shop
 * cashier and a chartered accountant — because the point of the taxonomy is
 * that they are the same shape of record. Names and text are Malayalam, so
 * that layout problems show up locally rather than after launch.
 */
async function seedSamplePeople(
  localityIds: KeyMap,
  categoryIds: Map<string, bigint>,
  anchorOrgId: bigint,
): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.log('  sample data  : skipped (NODE_ENV=production)');
    return;
  }

  const existing = await prisma.person.count();
  if (existing > 0) {
    console.log(`  sample data  : skipped (${existing} people already exist)`);
    return;
  }

  const edakkara = localityIds.get('kl-mpm-nilambur-edakkara');
  const vazhikkadavu = localityIds.get('kl-mpm-nilambur-vazhikkadavu');
  if (edakkara === undefined || vazhikkadavu === undefined) {
    throw new Error('Expected Edakkara and Vazhikkadavu in the seeded localities');
  }

  /** Phone → internal id, so the activity seeder can wire people together. */
  const createdIds = new Map<string, bigint>();

  const people = [
    {
      phone: '+919846000001',
      displayName: 'അബ്ദുൽ റഹ്‌മാൻ',
      headline: 'ഹാർഡ്‌വെയർ കട ഉടമ, കെ.വി.വി.ഇ.എസ്. അംഗം',
      localityId: edakkara,
      skills: [] as string[],
      verifiedMember: true,
    },
    {
      phone: '+919846000002',
      displayName: 'സുരേഷ് കുമാർ',
      headline: 'ഇലക്ട്രീഷ്യൻ, 12 വർഷം പരിചയം',
      localityId: edakkara,
      skills: ['electrician'],
      verifiedMember: false,
    },
    {
      phone: '+919846000003',
      displayName: 'ഫാത്തിമ ബീവി',
      headline: 'അക്കൗണ്ടന്റ്, ജി.എസ്.ടി. ഫയലിംഗ്',
      localityId: edakkara,
      skills: ['accountant'],
      verifiedMember: false,
    },
    {
      phone: '+919846000004',
      displayName: 'രാജൻ പി.',
      headline: 'ചുമട്ട് തൊഴിലാളി, ദിവസ ജോലി',
      localityId: vazhikkadavu,
      skills: [],
      verifiedMember: false,
    },
  ];

  for (const person of people) {
    const created = await prisma.person.create({
      data: {
        publicId: createId(),
        phone: person.phone,
        displayName: person.displayName,
        headline: person.headline,
        localityId: person.localityId,
        status: 'active',
        claimedAt: new Date(),
        consents: {
          create: {
            consentVersion: '2026-09-01.1',
            purpose: 'registration',
            locale: 'ml',
          },
        },
      },
      select: { id: true },
    });

    for (const slug of person.skills) {
      const categoryId = categoryIds.get(slug);
      if (categoryId === undefined) continue;
      await prisma.personSkill.create({
        data: { personId: created.id, categoryId, yearsExperience: 5 },
      });
    }

    if (person.verifiedMember) {
      await prisma.anchorMembership.create({
        data: {
          personId: created.id,
          anchorOrgId,
          role: 'office_bearer',
          status: 'verified',
          verifiedAt: new Date(),
        },
      });
    }

    createdIds.set(person.phone, created.id);
  }

  console.log(`  sample data  : ${people.length} people across all four tiers`);

  await seedSampleActivity(createdIds, localityIds, categoryIds);
}

/**
 * Sample requirements, recommendations and interest.
 *
 * Without these the app runs but shows nothing: a seeded database with people
 * and no postings looks broken to anyone opening it for the first time, and
 * the recommendation graph — the thing this product is actually about — is
 * invisible. Development only, guarded by the same checks as the sample people.
 */
async function seedSampleActivity(
  peopleByPhone: Map<string, bigint>,
  localityIds: KeyMap,
  categoryIds: Map<string, bigint>,
): Promise<void> {
  const shopOwner = peopleByPhone.get('+919846000001');
  const electrician = peopleByPhone.get('+919846000002');
  const accountant = peopleByPhone.get('+919846000003');
  const loader = peopleByPhone.get('+919846000004');

  const edakkara = localityIds.get('kl-mpm-nilambur-edakkara');
  const vazhikkadavu = localityIds.get('kl-mpm-nilambur-vazhikkadavu');

  if (
    shopOwner === undefined ||
    electrician === undefined ||
    accountant === undefined ||
    loader === undefined ||
    edakkara === undefined ||
    vazhikkadavu === undefined
  ) {
    console.warn('  activity     : skipped (expected sample people or localities missing)');
    return;
  }

  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  // Deliberately spans the tiers: counter staff, an electrician and an
  // accountant, so the taxonomy's claim that they are the same shape of record
  // is visible on the listing page rather than only in the schema.
  const requirements = [
    {
      title: 'ഹാർഡ്‌വെയർ കടയിൽ കൗണ്ടർ ജീവനക്കാരൻ',
      description:
        'രാവിലെ 9 മുതൽ വൈകിട്ട് 7 വരെ. ബില്ലിംഗ് അറിയണം. മലയാളം എഴുതാനും വായിക്കാനും അറിയണം.',
      categorySlug: 'sales-counter-staff',
      localityId: edakkara,
      engagementType: 'permanent',
      payMin: 12000,
      payMax: 15000,
      payPeriod: 'monthly',
      vacancies: 1,
    },
    {
      title: 'വീട്ടിലെ വയറിംഗ് ജോലിക്ക് ഇലക്ട്രീഷ്യൻ',
      description: 'പുതിയ വീട്, രണ്ട് നില. ഏകദേശം 10 ദിവസത്തെ ജോലി.',
      categorySlug: 'electrician',
      localityId: edakkara,
      engagementType: 'contract',
      payMin: 1200,
      payMax: null,
      payPeriod: 'daily',
      vacancies: 2,
    },
    {
      title: 'ജി.എസ്.ടി. ഫയലിംഗിന് അക്കൗണ്ടന്റ്',
      description: 'മാസത്തിൽ കുറച്ച് ദിവസം മതി. ടാലി അറിയുന്നവർ അഭികാമ്യം.',
      categorySlug: 'accountant',
      localityId: vazhikkadavu,
      engagementType: 'part_time',
      payMin: null,
      payMax: null,
      payPeriod: null,
      vacancies: 1,
    },
  ];

  let posted = 0;
  for (const requirement of requirements) {
    const categoryId = categoryIds.get(requirement.categorySlug);
    if (categoryId === undefined) continue;

    await prisma.requirement.create({
      data: {
        publicId: createId(),
        postedByPersonId: shopOwner,
        title: requirement.title,
        description: requirement.description,
        categoryId,
        localityId: requirement.localityId,
        engagementType: requirement.engagementType,
        payMin: requirement.payMin,
        payMax: requirement.payMax,
        payPeriod: requirement.payPeriod,
        contactPreference: 'call',
        vacancies: requirement.vacancies,
        status: 'open',
        expiresAt: in30Days,
      },
    });
    posted += 1;
  }

  // The point of the product: attributable vouches from a named member.
  const recommendations = [
    {
      subject: electrician,
      note: 'എന്റെ കടയിലെ വയറിംഗ് മുഴുവൻ ചെയ്തത് ഇദ്ദേഹമാണ്. വൃത്തിയായ പണി, പറഞ്ഞ സമയത്ത് തീർത്തു.',
      relationshipContext: 'hired_for_a_job',
      categorySlug: 'electrician',
    },
    {
      subject: accountant,
      note: 'മൂന്ന് വർഷമായി ഞങ്ങളുടെ കടയുടെ ജി.എസ്.ടി. ഫയലിംഗ് ചെയ്യുന്നു. ഒരു തവണ പോലും വൈകിയിട്ടില്ല.',
      relationshipContext: 'employed_them',
      categorySlug: 'accountant',
    },
    {
      subject: loader,
      note: 'ചരക്ക് ഇറക്കാൻ സ്ഥിരമായി വിളിക്കാറുണ്ട്. നല്ല അധ്വാനി, വിശ്വസിക്കാം.',
      relationshipContext: 'hired_for_a_job',
      categorySlug: null,
    },
  ];

  for (const recommendation of recommendations) {
    await prisma.recommendation.create({
      data: {
        publicId: createId(),
        referrerPersonId: shopOwner,
        subjectPersonId: recommendation.subject,
        note: recommendation.note,
        relationshipContext: recommendation.relationshipContext,
        categoryId: recommendation.categorySlug
          ? (categoryIds.get(recommendation.categorySlug) ?? null)
          : null,
        status: 'active',
        // Mirrors subjectPersonId while active; see prisma/schema.prisma.
        activeSubjectKey: recommendation.subject,
      },
    });
  }

  // One candidate has raised their hand, so the employer's view of interested
  // candidates — with their recommendations attached — has something in it.
  const wiringJob = await prisma.requirement.findFirst({
    where: { postedByPersonId: shopOwner, engagementType: 'contract' },
    select: { id: true },
  });

  if (wiringJob) {
    await prisma.interest.create({
      data: {
        publicId: createId(),
        requirementId: wiringJob.id,
        personId: electrician,
        status: 'expressed',
        note: 'എനിക്ക് സമയമുണ്ട്, വിളിക്കാം.',
      },
    });
  }

  console.log(
    `  activity     : ${posted} requirements, ${recommendations.length} recommendations, 1 interest`,
  );
}

async function main(): Promise<void> {
  console.log('\nSeeding Koode\n');

  const localityIds = await seedLocalities();
  await seedAdjacencies(localityIds);
  const categoryIds = await seedCategories();
  const anchorOrgId = await seedAnchorOrgs(localityIds);
  await seedSamplePeople(localityIds, categoryIds, anchorOrgId);
  await grantSeedAdmins();

  console.log(
    '\nDone.\n' +
      '\nNOTE: the locality adjacency data is hand-curated and approximate, and\n' +
      'Edakkara\'s ward list is a placeholder. Both must be reviewed by someone\n' +
      'with local knowledge before launch — see the comments in seed-data.ts.\n',
  );
}

main()
  .catch((error: unknown) => {
    console.error('\nSeed failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
