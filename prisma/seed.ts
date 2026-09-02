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
import { hashPassword } from '../src/server/crypto.ts';
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

async function seedAnchorOrgs(localityIds: KeyMap): Promise<Map<string, bigint>> {
  // Keyed by org type: the association verifies traders, the college verifies
  // graduates, and the sample people need to reach the right one.
  const ids = new Map<string, bigint>();

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

    ids.set(org.type, row.id);
  }

  console.log(`  anchor orgs  : ${SEED_ANCHOR_ORGS.length}`);
  if (ids.size === 0) throw new Error('No anchor org seeded');
  return ids;
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
  anchorOrgIds: Map<string, bigint>,
): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.log('  sample data  : skipped (NODE_ENV=production)');
    return;
  }

  // Idempotent per person, not all-or-nothing. A seed that skips itself the
  // moment one row exists cannot add a new persona to a database that already
  // has the old ones — which is exactly what a growing sample set needs. So
  // each persona is created if absent and lightly updated if present; real
  // sign-ups never share these example.com addresses, so nothing of theirs is
  // touched.

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
      email: 'abdul@example.com',
      displayName: 'അബ്ദുൽ റഹ്‌മാൻ',
      headline: 'ഹാർഡ്‌വെയർ കട ഉടമ, വ്യാപാരി സംഘടനാ അംഗം',
      localityId: edakkara,
      skills: [] as string[],
      education: null as string | null,
      accountType: 'employer' as const,
      // Office-bearer of the traders' association: verifies its members.
      verifiedMember: true,
      verifiedBy: 'merchant_assoc' as string | null,
      memberRole: 'office_bearer' as 'office_bearer' | 'member',
    },
    {
      phone: '+919846000002',
      email: 'suresh@example.com',
      displayName: 'സുരേഷ് കുമാർ',
      headline: 'ഇലക്ട്രീഷ്യൻ, 12 വർഷം പരിചയം',
      localityId: edakkara,
      skills: ['electrician'],
      education: null as string | null,
      accountType: 'seeker' as const,
      verifiedMember: false,
      verifiedBy: null as string | null,
      memberRole: 'member' as 'office_bearer' | 'member',
    },
    {
      phone: '+919846000003',
      email: 'fathima@example.com',
      displayName: 'ഫാത്തിമ ബീവി',
      headline: 'അക്കൗണ്ടന്റ്, ജി.എസ്.ടി. ഫയലിംഗ്',
      localityId: edakkara,
      skills: ['accountant'],
      education: null as string | null,
      accountType: 'seeker' as const,
      verifiedMember: false,
      verifiedBy: null as string | null,
      memberRole: 'member' as 'office_bearer' | 'member',
    },
    {
      phone: '+919846000004',
      email: 'rajan@example.com',
      displayName: 'രാജൻ പി.',
      headline: 'ചുമട്ട് തൊഴിലാളി, ദിവസ ജോലി',
      localityId: vazhikkadavu,
      skills: [],
      education: null as string | null,
      accountType: 'seeker' as const,
      verifiedMember: false,
      verifiedBy: null as string | null,
      memberRole: 'member' as 'office_bearer' | 'member',
    },
    {
      phone: '+919846000005',
      email: 'anju@example.com',
      displayName: 'അഞ്ജു എസ്.',
      headline: 'ബി.കോം ബിരുദധാരി, ടാലി, ജി.എസ്.ടി. ബില്ലിംഗ്',
      localityId: edakkara,
      skills: ['billing-staff', 'accountant'],
      education: 'ബി.കോം 2024, എടക്കര ആർട്സ് & സയൻസ് കോളേജ്' as string | null,
      accountType: 'seeker' as const,
      // A graduate whose college has confirmed her — the verified-profile
      // story the launch plan leads with.
      verifiedMember: true,
      verifiedBy: 'college' as string | null,
      memberRole: 'member' as 'office_bearer' | 'member',
    },
  ];

  for (const person of people) {
    const already = await prisma.person.findUnique({
      where: { email: person.email },
      select: { id: true },
    });
    if (already) {
      await prisma.person.update({
        where: { id: already.id },
        data: {
          headline: person.headline,
          education: person.education,
          accountType: person.accountType,
        },
      });
      createdIds.set(person.phone, already.id);
      continue;
    }

    const created = await prisma.person.create({
      data: {
        publicId: createId(),
        phone: person.phone,
        email: person.email,
        // Same address doubles as the published contact e-mail for the sample.
        contactEmail: person.email,
        // Development convenience only: lets anyone running the seed sign in
        // as a sample person. NODE_ENV=production skips sample people wholesale.
        passwordHash: await hashPassword('koode1234'),
        displayName: person.displayName,
        headline: person.headline,
        education: person.education,
        accountType: person.accountType,
        localityId: person.localityId,
        status: 'active',
        claimedAt: new Date(),
        consents: {
          create: {
            consentVersion: '2026-09-02.1',
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

    if (person.verifiedMember && person.verifiedBy) {
      const anchorOrgId = anchorOrgIds.get(person.verifiedBy);
      if (anchorOrgId === undefined) throw new Error(`No seeded org of type ${person.verifiedBy}`);
      await prisma.anchorMembership.create({
        data: {
          personId: created.id,
          anchorOrgId,
          role: person.memberRole,
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
  /**
   * A deliberately BILINGUAL mix.
   *
   * Postings are stored exactly as the employer typed them — no job board
   * translates user content, and Koode does not either. But Edakkara is
   * bilingual, so a realistic listing is a mix, and seeding only Malayalam
   * made the English site look broken to anyone browsing it. Roughly half
   * and half, spread across the tiers.
   */
  const requirements = [
    // The three the owner asked for by name in the voice note: "sales staff,
    // billing staff, drivers needed" — the kind of posting a shop on the main
    // road actually puts up. Two in Malayalam, one in English, because both
    // happen.
    {
      title: 'സെയിൽസ് സ്റ്റാഫിനെ ആവശ്യമുണ്ട്',
      description:
        'ടെക്സ്റ്റൈൽ കടയിലേക്ക്. രാവിലെ 10 മുതൽ രാത്രി 8 വരെ. ഉപഭോക്താക്കളോട് സംസാരിക്കാൻ കഴിയണം. മുൻപരിചയം ഗുണകരം, നിർബന്ധമല്ല.',
      categorySlug: 'sales-counter-staff',
      localityId: edakkara,
      engagementType: 'permanent',
      payMin: 11000,
      payMax: 14000,
      payPeriod: 'monthly',
      vacancies: 2,
      contactPreference: 'whatsapp',
    },
    {
      title: 'Billing staff needed',
      description:
        'Supermarket billing counter. Must be comfortable with a billing machine and basic computer work. Training given. Day shift, weekly off.',
      categorySlug: 'billing-staff',
      localityId: edakkara,
      engagementType: 'permanent',
      payMin: 12000,
      payMax: 15000,
      payPeriod: 'monthly',
      vacancies: 1,
      contactPreference: 'call',
    },
    {
      title: 'ഡ്രൈവർ വേണം (ലൈറ്റ് വെഹിക്കിൾ)',
      description:
        'കടയുടെ ഡെലിവറി വാനിന്. എൽ.എം.വി. ലൈസൻസ് നിർബന്ധം. എടക്കര–നിലമ്പൂർ റൂട്ട്. രാവിലെ 9 മുതൽ വൈകിട്ട് 6 വരെ.',
      categorySlug: 'driver-light-vehicle',
      localityId: edakkara,
      engagementType: 'permanent',
      payMin: 15000,
      payMax: 18000,
      payPeriod: 'monthly',
      vacancies: 1,
      contactPreference: 'call',
    },
    {
      title: 'Counter staff for a hardware shop',
      description:
        '9am to 7pm, Sunday off. Billing experience preferred. Must be able to read and write Malayalam and English.',
      categorySlug: 'sales-counter-staff',
      localityId: edakkara,
      engagementType: 'permanent',
      payMin: 12000,
      payMax: 15000,
      payPeriod: 'monthly',
      vacancies: 1,
      contactPreference: 'call',
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
      contactPreference: 'call',
    },
    {
      title: 'Accountant for GST filing (part-time)',
      description:
        'A few days a month. Tally experience preferred. Work can be done from our office in Vazhikkadavu.',
      categorySlug: 'accountant',
      localityId: vazhikkadavu,
      engagementType: 'part_time',
      payMin: null,
      payMax: null,
      payPeriod: null,
      vacancies: 1,
      contactPreference: 'email',
    },
    {
      title: 'ചരക്ക് ഇറക്കാൻ ആളെ വേണം',
      description: 'ആഴ്ചയിൽ രണ്ട് ദിവസം, രാവിലെ മാത്രം. ദിവസക്കൂലി അന്നുതന്നെ.',
      categorySlug: 'loading-unloading',
      localityId: edakkara,
      engagementType: 'one_day',
      payMin: 900,
      payMax: 1100,
      payPeriod: 'daily',
      vacancies: 3,
      contactPreference: 'call',
    },
    {
      title: 'Maths tutor for Class 9 and 10',
      description:
        'Evenings, four days a week, at the student\'s home in Edakkara. B.Ed or teaching experience preferred.',
      categorySlug: 'teacher',
      localityId: edakkara,
      engagementType: 'part_time',
      payMin: 6000,
      payMax: 8000,
      payPeriod: 'monthly',
      vacancies: 1,
      contactPreference: 'either',
    },
    {
      title: 'തയ്യൽ കടയിൽ സഹായി',
      description: 'പരിചയം വേണമെന്നില്ല, പഠിപ്പിക്കാം. സ്ഥിരം ജോലി.',
      categorySlug: 'tailor',
      localityId: vazhikkadavu,
      engagementType: 'permanent',
      payMin: 9000,
      payMax: 11000,
      payPeriod: 'monthly',
      vacancies: 1,
      contactPreference: 'call',
    },
  ];

  let posted = 0;
  for (const requirement of requirements) {
    const present = await prisma.requirement.findFirst({
      where: { postedByPersonId: shopOwner, title: requirement.title },
      select: { id: true },
    });
    if (present) continue;

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
        contactPreference: requirement.contactPreference,
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
      note: 'Has handled our shop GST filing for three years. Never once filed late, and explains things in plain terms.',
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
    const said = await prisma.recommendation.findFirst({
      where: {
        referrerPersonId: shopOwner,
        subjectPersonId: recommendation.subject,
        status: 'active',
      },
      select: { id: true },
    });
    if (said) continue;

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
  // The graduate has applied for the billing job and been shortlisted: the
  // employer's candidates view has a match to show, and her dashboard has a
  // status to read.
  const graduate = peopleByPhone.get('+919846000005');
  const billingJob = await prisma.requirement.findFirst({
    where: { postedByPersonId: shopOwner, title: 'Billing staff needed' },
    select: { id: true },
  });
  if (graduate !== undefined && billingJob) {
    const applied = await prisma.interest.findUnique({
      where: { requirementId_personId: { requirementId: billingJob.id, personId: graduate } },
      select: { id: true },
    });
    if (!applied) await prisma.interest.create({
      data: {
        publicId: createId(),
        requirementId: billingJob.id,
        personId: graduate,
        status: 'shortlisted',
      },
    });
  }

  const wiringJob = await prisma.requirement.findFirst({
    where: { postedByPersonId: shopOwner, engagementType: 'contract' },
    select: { id: true },
  });

  if (wiringJob) {
    const asked = await prisma.interest.findUnique({
      where: { requirementId_personId: { requirementId: wiringJob.id, personId: electrician } },
      select: { id: true },
    });
    if (!asked) await prisma.interest.create({
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
  const anchorOrgIds = await seedAnchorOrgs(localityIds);
  await seedSamplePeople(localityIds, categoryIds, anchorOrgIds);
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
