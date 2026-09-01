/**
 * Koode reference seed data — Edakkara, Nilambur taluk, Malappuram, Kerala.
 *
 * DATA ONLY. No Prisma client, no DB access, no imports. The seed runner
 * (prisma/seed.ts) imports these consts and does all the writing.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ LOCAL VERIFICATION REQUIRED BEFORE LAUNCH
 * ---------------------------------------------------------------------------
 * Everything below was compiled from general knowledge of the Nilambur /
 * Kalikavu area, NOT from an official Local Self Government Department (LSGD)
 * gazetteer. Before this data goes anywhere near real users, somebody from
 * KVVES Edakkara with actual local knowledge must review:
 *
 *   1. SEED_ADJACENCIES — which panchayats genuinely share a border. This is
 *      hand-curated and approximate. Adjacency CANNOT be derived from the
 *      locality tree: two panchayats can sit in different blocks and still
 *      touch, and two panchayats in the same block need not touch at all.
 *      This drives "nearby work" matching, so a wrong edge means a job is
 *      shown to the wrong village. See the per-pair confidence notes.
 *   2. The Edakkara ward list — names, spellings AND the real ward count.
 *      The six below are placeholders (see the ward section note).
 *   3. Whether Nilambur Municipality should hang off Nilambur block at all
 *      (see the note on that row).
 *   4. Malayalam wording — see the note above SEED_CATEGORIES on gendered
 *      job titles and on deliberately avoided caste-linked trade names.
 *
 * Items flagged `// VERIFY:` are the ones the reviewer should look at first.
 */

// ===========================================================================
// 1. Locality tree
// ===========================================================================

export type SeedLocality = {
  /** Stable unique slug, e.g. 'kl-mpm-nilambur-edakkara'. Seed-file identity only. */
  key: string;
  level: 'state' | 'district' | 'block' | 'panchayat' | 'ward';
  nameEn: string;
  nameMl: string;
  /** References another SeedLocality.key. Null only for the state root. */
  parentKey: string | null;
};

/**
 * Ordered parents-before-children so a runner can insert sequentially and
 * always resolve parentKey to an already-created row.
 *
 * Scope note: this is deliberately NOT all of Malappuram. It covers Edakkara
 * and the ring of panchayats around it — the realistic travel-to-work area for
 * a labourer from Edakkara. Wider coverage can be appended later; the keys are
 * namespaced so nothing collides.
 */
export const SEED_LOCALITIES: SeedLocality[] = [
  // --- state ---------------------------------------------------------------
  { key: 'kl', level: 'state', nameEn: 'Kerala', nameMl: 'കേരളം', parentKey: null },

  // --- district ------------------------------------------------------------
  { key: 'kl-mpm', level: 'district', nameEn: 'Malappuram', nameMl: 'മലപ്പുറം', parentKey: 'kl' },

  // --- blocks --------------------------------------------------------------
  // Both are real block panchayats in Malappuram district. Nilambur block and
  // Kalikavu block both fall inside Nilambur taluk.
  { key: 'kl-mpm-nilambur', level: 'block', nameEn: 'Nilambur', nameMl: 'നിലമ്പൂർ', parentKey: 'kl-mpm' },
  { key: 'kl-mpm-kalikavu', level: 'block', nameEn: 'Kalikavu', nameMl: 'കാളികാവ്', parentKey: 'kl-mpm' },

  // --- panchayats under Nilambur block -------------------------------------
  // The seven grama panchayats below are the ones understood to constitute
  // Nilambur block panchayat. VERIFY: confirm the full membership list against
  // the LSGD directory — if a panchayat is missing here, its residents simply
  // cannot be registered.
  {
    key: 'kl-mpm-nilambur-edakkara',
    level: 'panchayat',
    nameEn: 'Edakkara',
    nameMl: 'എടക്കര',
    parentKey: 'kl-mpm-nilambur',
  },
  {
    key: 'kl-mpm-nilambur-vazhikkadavu',
    level: 'panchayat',
    nameEn: 'Vazhikkadavu',
    nameMl: 'വഴിക്കടവ്',
    parentKey: 'kl-mpm-nilambur',
  },
  {
    key: 'kl-mpm-nilambur-moothedam',
    level: 'panchayat',
    nameEn: 'Moothedam',
    nameMl: 'മൂത്തേടം',
    parentKey: 'kl-mpm-nilambur',
  },
  {
    key: 'kl-mpm-nilambur-chungathara',
    level: 'panchayat',
    nameEn: 'Chungathara',
    nameMl: 'ചുങ്കത്തറ',
    parentKey: 'kl-mpm-nilambur',
  },
  {
    key: 'kl-mpm-nilambur-karulai',
    level: 'panchayat',
    nameEn: 'Karulai',
    nameMl: 'കരുളായി',
    parentKey: 'kl-mpm-nilambur',
  },
  {
    key: 'kl-mpm-nilambur-pothukallu',
    level: 'panchayat',
    nameEn: 'Pothukallu',
    nameMl: 'പോത്തുകല്ല്',
    parentKey: 'kl-mpm-nilambur',
  },
  {
    key: 'kl-mpm-nilambur-amarambalam',
    level: 'panchayat',
    nameEn: 'Amarambalam',
    nameMl: 'അമരമ്പലം',
    parentKey: 'kl-mpm-nilambur',
  },

  // VERIFY: Nilambur Municipality is an urban local body. In Kerala's LSGD
  // structure a municipality is NOT a member of a block panchayat — it reports
  // to the district. It is parented to Nilambur block here purely so the tree
  // stays a single connected hierarchy and so Nilambur town is selectable in
  // the locality picker. If the product ever surfaces the block level as an
  // administrative fact (rather than as a grouping), this row must move to sit
  // directly under 'kl-mpm'.
  {
    key: 'kl-mpm-nilambur-municipality',
    level: 'panchayat',
    nameEn: 'Nilambur Municipality',
    nameMl: 'നിലമ്പൂർ നഗരസഭ',
    parentKey: 'kl-mpm-nilambur',
  },

  // --- panchayats under Kalikavu block -------------------------------------
  // Only the two named panchayats are seeded. Kalikavu block has further member
  // panchayats that are deliberately omitted rather than guessed at.
  // VERIFY: add the remaining Kalikavu block panchayats before launch.
  {
    key: 'kl-mpm-kalikavu-kalikavu',
    level: 'panchayat',
    nameEn: 'Kalikavu',
    nameMl: 'കാളികാവ്',
    parentKey: 'kl-mpm-kalikavu',
  },
  {
    key: 'kl-mpm-kalikavu-chokkad',
    level: 'panchayat',
    nameEn: 'Chokkad',
    nameMl: 'ചോക്കാട്',
    parentKey: 'kl-mpm-kalikavu',
  },

  // --- wards (Edakkara panchayat only) -------------------------------------
  // VERIFY — HIGH PRIORITY. These six wards are PLACEHOLDERS built from
  // well-known settlement names inside/around Edakkara panchayat. Two things
  // are near-certainly wrong:
  //   (a) The count. A Kerala grama panchayat of Edakkara's size has roughly
  //       18-23 wards, not 6. This is a starter subset, not the real division.
  //   (b) The numbering. w01..w06 are file-local ordering keys and do NOT
  //       correspond to official ward numbers.
  // Replace wholesale with the official ward list from the Edakkara Grama
  // Panchayat office. No other panchayat is given wards on purpose — Edakkara
  // is the launch locality and ward-level precision is only needed there.
  {
    key: 'kl-mpm-nilambur-edakkara-w01-edakkara-town',
    level: 'ward',
    nameEn: 'Edakkara Town',
    nameMl: 'എടക്കര ടൗൺ',
    parentKey: 'kl-mpm-nilambur-edakkara',
  },
  {
    key: 'kl-mpm-nilambur-edakkara-w02-chandakunnu',
    level: 'ward',
    nameEn: 'Chandakunnu',
    nameMl: 'ചന്തക്കുന്ന്',
    parentKey: 'kl-mpm-nilambur-edakkara',
  },
  {
    key: 'kl-mpm-nilambur-edakkara-w03-kumbalappara',
    level: 'ward',
    nameEn: 'Kumbalappara',
    nameMl: 'കുമ്പളപ്പാറ',
    parentKey: 'kl-mpm-nilambur-edakkara',
  },
  {
    key: 'kl-mpm-nilambur-edakkara-w04-karakkodu',
    level: 'ward',
    nameEn: 'Karakkodu',
    nameMl: 'കാരക്കോട്',
    parentKey: 'kl-mpm-nilambur-edakkara',
  },
  {
    key: 'kl-mpm-nilambur-edakkara-w05-mancheeri',
    level: 'ward',
    nameEn: 'Mancheeri',
    nameMl: 'മാഞ്ചീരി',
    parentKey: 'kl-mpm-nilambur-edakkara',
  },
  {
    key: 'kl-mpm-nilambur-edakkara-w06-kanjirakadavu',
    level: 'ward',
    nameEn: 'Kanjirakadavu',
    nameMl: 'കാഞ്ഞിരക്കടവ്',
    parentKey: 'kl-mpm-nilambur-edakkara',
  },
];

// ===========================================================================
// 2. Locality adjacency
// ===========================================================================

export type SeedAdjacency = { aKey: string; bKey: string };

/**
 * Which PANCHAYATS actually border each other.
 *
 * ⚠️ HAND-CURATED, APPROXIMATE, AND UNVERIFIED. Compiled from general
 * knowledge of the area's road and river geography, not from a survey map or
 * an LSGD boundary dataset. It MUST be reviewed by someone with local
 * knowledge before launch.
 *
 * Why it exists as its own table: the locality tree cannot derive adjacency.
 * Sharing a parent block does not imply sharing a border, and panchayats in
 * different blocks (or different taluks) frequently do share one. Physical
 * neighbourliness is a separate fact from administrative nesting, and this
 * platform matches work by "how far can a person realistically travel", which
 * follows the border graph rather than the tree.
 *
 * Conventions:
 *   - UNDIRECTED. Each pair appears exactly ONCE; the runner is responsible
 *     for inserting both (a→b) and (b→a) rows into locality_adjacency.
 *   - Panchayat level only. Wards and blocks get no adjacency edges.
 *   - Confidence is marked per pair. `low` pairs are the first thing a local
 *     reviewer should delete or confirm.
 */
export const SEED_ADJACENCIES: SeedAdjacency[] = [
  // --- Edakkara's own ring (the pairs that matter most) ---------------------
  // Edakkara sits on the Nilambur–Nadukani/Gudalur road, with Vazhikkadavu
  // uphill to its east and Moothedam downhill toward Nilambur town to its west.
  // confidence: high
  { aKey: 'kl-mpm-nilambur-edakkara', bKey: 'kl-mpm-nilambur-vazhikkadavu' },
  // confidence: high
  { aKey: 'kl-mpm-nilambur-edakkara', bKey: 'kl-mpm-nilambur-moothedam' },
  // confidence: medium — Pothukallu lies to the north; the exact meeting point
  // runs through forest/plantation land. VERIFY.
  { aKey: 'kl-mpm-nilambur-edakkara', bKey: 'kl-mpm-nilambur-pothukallu' },
  // confidence: medium — Karulai's reserve-forest tract extends a long way
  // south/south-east of Edakkara. Whether the boundaries actually touch, or
  // whether Moothedam separates them, needs local confirmation. VERIFY.
  { aKey: 'kl-mpm-nilambur-edakkara', bKey: 'kl-mpm-nilambur-karulai' },

  // --- Moothedam / Nilambur town cluster -----------------------------------
  // confidence: high — Moothedam adjoins Nilambur town.
  { aKey: 'kl-mpm-nilambur-moothedam', bKey: 'kl-mpm-nilambur-municipality' },
  // confidence: high
  { aKey: 'kl-mpm-nilambur-moothedam', bKey: 'kl-mpm-nilambur-chungathara' },
  // confidence: medium
  { aKey: 'kl-mpm-nilambur-moothedam', bKey: 'kl-mpm-nilambur-karulai' },
  // confidence: high
  { aKey: 'kl-mpm-nilambur-municipality', bKey: 'kl-mpm-nilambur-chungathara' },
  // confidence: high
  { aKey: 'kl-mpm-nilambur-municipality', bKey: 'kl-mpm-nilambur-karulai' },

  // --- northern / eastern edge ---------------------------------------------
  // confidence: medium — both sit north-east of Nilambur along the ghat side.
  { aKey: 'kl-mpm-nilambur-vazhikkadavu', bKey: 'kl-mpm-nilambur-pothukallu' },
  // confidence: low — Pothukallu and Chungathara may only meet across the
  // Chaliyar rather than sharing a land border. VERIFY or drop.
  { aKey: 'kl-mpm-nilambur-pothukallu', bKey: 'kl-mpm-nilambur-chungathara' },

  // --- southern forest belt ------------------------------------------------
  // confidence: high — Karulai and Amarambalam are the two southern
  // forest-heavy panchayats and share the New Amarambalam side.
  { aKey: 'kl-mpm-nilambur-karulai', bKey: 'kl-mpm-nilambur-amarambalam' },
  // confidence: medium
  { aKey: 'kl-mpm-nilambur-chungathara', bKey: 'kl-mpm-nilambur-amarambalam' },

  // --- across the block line into Kalikavu ---------------------------------
  // Cross-block edges are exactly what the tree cannot express. Both of these
  // are the sort of thing a local reviewer will know instantly.
  // confidence: medium — VERIFY.
  { aKey: 'kl-mpm-nilambur-amarambalam', bKey: 'kl-mpm-kalikavu-kalikavu' },
  // confidence: low — VERIFY or drop.
  { aKey: 'kl-mpm-nilambur-karulai', bKey: 'kl-mpm-kalikavu-kalikavu' },
  // confidence: high — neighbouring panchayats inside Kalikavu block.
  { aKey: 'kl-mpm-kalikavu-kalikavu', bKey: 'kl-mpm-kalikavu-chokkad' },
];

// ===========================================================================
// 3. Category taxonomy
// ===========================================================================

export type SeedCategory = {
  /** kebab-case, globally unique across tiers and roles. */
  slug: string;
  level: 'tier' | 'role';
  nameEn: string;
  nameMl: string;
  /** References another SeedCategory.slug. Null for tiers. */
  parentSlug: string | null;
  sortOrder: number;
};

/**
 * Four tiers, each with 8-14 roles. Every row is structurally identical: a
 * chartered accountant and a loading worker are the same shape of record,
 * under the same tier schema, with the same fields. Nothing in this file
 * ranks a tier above another — the four tiers are ordered for browsing, not
 * for status. Do not add prestige-implying fields here.
 *
 * Ordering: each tier is immediately followed by its own roles, so a runner
 * inserting sequentially always has the parent available.
 *
 * VERIFY (Malayalam wording), for the KVVES team:
 *   - Some role names use the conventional masculine Malayalam form
 *     (e.g. 'കൊത്തുപണിക്കാരൻ', 'സ്വർണ്ണപ്പണിക്കാരൻ') simply because that is
 *     how the trade is spoken about locally. Where a neutral noun was equally
 *     natural ('തൊഴിലാളി', 'ജീവനക്കാർ', an English loanword) it was preferred.
 *     Confirm whether the association wants fully gender-neutral phrasing.
 *   - Caste-linked occupational words were deliberately AVOIDED: carpenter is
 *     'മരപ്പണിക്കാരൻ' not 'ആശാരി', goldsmith is 'സ്വർണ്ണപ്പണിക്കാരൻ' not
 *     'തട്ടാൻ'. Keep it that way unless the community explicitly asks
 *     otherwise.
 */
export const SEED_CATEGORIES: SeedCategory[] = [
  // =========================================================================
  // Tier 1 — Daily & manual work
  // =========================================================================
  {
    slug: 'daily-manual',
    level: 'tier',
    nameEn: 'Daily & manual work',
    nameMl: 'ദിവസ, കായിക ജോലികൾ',
    parentSlug: null,
    sortOrder: 1,
  },
  {
    slug: 'loading-unloading',
    level: 'role',
    nameEn: 'Loading & unloading worker',
    nameMl: 'ചുമട്ട് തൊഴിലാളി',
    parentSlug: 'daily-manual',
    sortOrder: 1,
  },
  {
    slug: 'construction-helper',
    level: 'role',
    nameEn: 'Construction helper',
    nameMl: 'നിർമ്മാണ സഹായി',
    parentSlug: 'daily-manual',
    sortOrder: 2,
  },
  {
    slug: 'housekeeping',
    level: 'role',
    nameEn: 'Housekeeping & domestic help',
    nameMl: 'വീട്ടുജോലി, ഹൗസ്കീപ്പിംഗ്',
    parentSlug: 'daily-manual',
    sortOrder: 3,
  },
  {
    slug: 'cleaning-sanitation',
    level: 'role',
    nameEn: 'Cleaning & sanitation',
    nameMl: 'ശുചീകരണ തൊഴിലാളി',
    parentSlug: 'daily-manual',
    sortOrder: 4,
  },
  {
    slug: 'farm-work',
    level: 'role',
    nameEn: 'Farm & agricultural work',
    nameMl: 'കൃഷിപ്പണി',
    parentSlug: 'daily-manual',
    sortOrder: 5,
  },
  {
    slug: 'rubber-tapping',
    level: 'role',
    nameEn: 'Rubber tapping',
    nameMl: 'റബ്ബർ ടാപ്പിംഗ്',
    parentSlug: 'daily-manual',
    sortOrder: 6,
  },
  {
    slug: 'plantation-work',
    level: 'role',
    nameEn: 'Plantation work',
    nameMl: 'തോട്ടം തൊഴിലാളി',
    parentSlug: 'daily-manual',
    sortOrder: 7,
  },
  {
    slug: 'coconut-climbing',
    level: 'role',
    nameEn: 'Coconut climbing & tree work',
    nameMl: 'തെങ്ങുകയറ്റ തൊഴിലാളി',
    parentSlug: 'daily-manual',
    sortOrder: 8,
  },
  {
    slug: 'delivery-rider',
    level: 'role',
    nameEn: 'Delivery rider',
    nameMl: 'ഡെലിവറി റൈഡർ',
    parentSlug: 'daily-manual',
    sortOrder: 9,
  },
  {
    slug: 'catering-helper',
    level: 'role',
    nameEn: 'Catering & event helper',
    nameMl: 'കാറ്ററിംഗ് സഹായി',
    parentSlug: 'daily-manual',
    sortOrder: 10,
  },
  {
    slug: 'security-guard',
    level: 'role',
    nameEn: 'Security guard',
    nameMl: 'സെക്യൂരിറ്റി ഗാർഡ്',
    parentSlug: 'daily-manual',
    sortOrder: 11,
  },
  {
    slug: 'gardening-grounds',
    level: 'role',
    nameEn: 'Gardening & grounds upkeep',
    nameMl: 'പൂന്തോട്ട, പരിസര പരിപാലനം',
    parentSlug: 'daily-manual',
    sortOrder: 12,
  },

  // =========================================================================
  // Tier 2 — Skilled trades
  // =========================================================================
  {
    slug: 'skilled-trades',
    level: 'tier',
    nameEn: 'Skilled trades',
    nameMl: 'വൈദഗ്ധ്യ തൊഴിലുകൾ',
    parentSlug: null,
    sortOrder: 2,
  },
  {
    slug: 'electrician',
    level: 'role',
    nameEn: 'Electrician',
    nameMl: 'ഇലക്ട്രീഷ്യൻ',
    parentSlug: 'skilled-trades',
    sortOrder: 1,
  },
  {
    slug: 'plumber',
    level: 'role',
    nameEn: 'Plumber',
    nameMl: 'പ്ലംബർ',
    parentSlug: 'skilled-trades',
    sortOrder: 2,
  },
  {
    slug: 'carpenter',
    level: 'role',
    nameEn: 'Carpenter',
    nameMl: 'മരപ്പണിക്കാരൻ',
    parentSlug: 'skilled-trades',
    sortOrder: 3,
  },
  {
    slug: 'mason',
    level: 'role',
    nameEn: 'Mason',
    nameMl: 'കൊത്തുപണിക്കാരൻ',
    parentSlug: 'skilled-trades',
    sortOrder: 4,
  },
  {
    slug: 'painter',
    level: 'role',
    nameEn: 'Painter',
    nameMl: 'പെയിന്റർ',
    parentSlug: 'skilled-trades',
    sortOrder: 5,
  },
  {
    slug: 'welder-fabricator',
    level: 'role',
    nameEn: 'Welder & fabricator',
    nameMl: 'വെൽഡർ, ഫാബ്രിക്കേഷൻ',
    parentSlug: 'skilled-trades',
    sortOrder: 6,
  },
  {
    slug: 'two-wheeler-mechanic',
    level: 'role',
    nameEn: 'Two-wheeler & auto mechanic',
    nameMl: 'ഇരുചക്ര വാഹന, ഓട്ടോ മെക്കാനിക്ക്',
    parentSlug: 'skilled-trades',
    sortOrder: 7,
  },
  {
    slug: 'motor-mechanic',
    level: 'role',
    nameEn: 'Car & heavy vehicle mechanic',
    nameMl: 'കാർ, ഹെവി വാഹന മെക്കാനിക്ക്',
    parentSlug: 'skilled-trades',
    sortOrder: 8,
  },
  {
    slug: 'driver-light-vehicle',
    level: 'role',
    nameEn: 'Driver (light vehicle)',
    nameMl: 'ഡ്രൈവർ (ലൈറ്റ് വെഹിക്കിൾ)',
    parentSlug: 'skilled-trades',
    sortOrder: 9,
  },
  {
    slug: 'driver-heavy-vehicle',
    level: 'role',
    nameEn: 'Driver (heavy vehicle)',
    nameMl: 'ഡ്രൈവർ (ഹെവി വെഹിക്കിൾ)',
    parentSlug: 'skilled-trades',
    sortOrder: 10,
  },
  {
    slug: 'tailor',
    level: 'role',
    nameEn: 'Tailor',
    nameMl: 'തയ്യൽ തൊഴിലാളി',
    parentSlug: 'skilled-trades',
    sortOrder: 11,
  },
  {
    slug: 'ac-refrigeration-technician',
    level: 'role',
    nameEn: 'AC & refrigeration technician',
    nameMl: 'എ.സി., റഫ്രിജറേഷൻ ടെക്നീഷ്യൻ',
    parentSlug: 'skilled-trades',
    sortOrder: 12,
  },
  {
    slug: 'mobile-electronics-repair',
    level: 'role',
    nameEn: 'Mobile & electronics repair',
    nameMl: 'മൊബൈൽ, ഇലക്ട്രോണിക്സ് റിപ്പയർ',
    parentSlug: 'skilled-trades',
    sortOrder: 13,
  },
  {
    slug: 'goldsmith',
    level: 'role',
    nameEn: 'Goldsmith',
    nameMl: 'സ്വർണ്ണപ്പണിക്കാരൻ',
    parentSlug: 'skilled-trades',
    sortOrder: 14,
  },

  // =========================================================================
  // Tier 3 — Commercial & operations
  // =========================================================================
  {
    slug: 'commercial-operations',
    level: 'tier',
    nameEn: 'Commercial & operations',
    nameMl: 'വ്യാപാരം, നടത്തിപ്പ്',
    parentSlug: null,
    sortOrder: 3,
  },
  {
    slug: 'sales-counter-staff',
    level: 'role',
    nameEn: 'Sales & counter staff',
    nameMl: 'സെയിൽസ്, കൗണ്ടർ സ്റ്റാഫ്',
    parentSlug: 'commercial-operations',
    sortOrder: 1,
  },
  {
    slug: 'cashier',
    level: 'role',
    nameEn: 'Cashier',
    nameMl: 'കാഷ്യർ',
    parentSlug: 'commercial-operations',
    sortOrder: 2,
  },
  {
    slug: 'billing-staff',
    level: 'role',
    nameEn: 'Billing staff',
    nameMl: 'ബില്ലിംഗ് സ്റ്റാഫ്',
    parentSlug: 'commercial-operations',
    sortOrder: 3,
  },
  {
    slug: 'storekeeper',
    level: 'role',
    nameEn: 'Storekeeper',
    nameMl: 'സ്റ്റോർ കീപ്പർ',
    parentSlug: 'commercial-operations',
    sortOrder: 4,
  },
  {
    slug: 'supervisor',
    level: 'role',
    nameEn: 'Supervisor',
    nameMl: 'സൂപ്പർവൈസർ',
    parentSlug: 'commercial-operations',
    sortOrder: 5,
  },
  {
    slug: 'logistics-coordinator',
    level: 'role',
    nameEn: 'Logistics coordinator',
    nameMl: 'ലോജിസ്റ്റിക്സ് കോഓർഡിനേറ്റർ',
    parentSlug: 'commercial-operations',
    sortOrder: 6,
  },
  {
    slug: 'purchase-assistant',
    level: 'role',
    nameEn: 'Purchase assistant',
    nameMl: 'പർച്ചേസ് അസിസ്റ്റന്റ്',
    parentSlug: 'commercial-operations',
    sortOrder: 7,
  },
  {
    slug: 'medical-shop-assistant',
    level: 'role',
    nameEn: 'Medical shop assistant',
    nameMl: 'മെഡിക്കൽ ഷോപ്പ് അസിസ്റ്റന്റ്',
    parentSlug: 'commercial-operations',
    sortOrder: 8,
  },
  {
    slug: 'hotel-restaurant-staff',
    level: 'role',
    nameEn: 'Hotel & restaurant staff',
    nameMl: 'ഹോട്ടൽ, റെസ്റ്റോറന്റ് ജീവനക്കാർ',
    parentSlug: 'commercial-operations',
    sortOrder: 9,
  },
  {
    slug: 'cook-kitchen-staff',
    level: 'role',
    nameEn: 'Cook & kitchen staff',
    nameMl: 'പാചക, അടുക്കള ജീവനക്കാർ',
    parentSlug: 'commercial-operations',
    sortOrder: 10,
  },
  {
    slug: 'textile-shop-staff',
    level: 'role',
    nameEn: 'Textile shop staff',
    nameMl: 'തുണിക്കട ജീവനക്കാർ',
    parentSlug: 'commercial-operations',
    sortOrder: 11,
  },
  {
    slug: 'bakery-staff',
    level: 'role',
    nameEn: 'Bakery & sweet shop staff',
    nameMl: 'ബേക്കറി ജീവനക്കാർ',
    parentSlug: 'commercial-operations',
    sortOrder: 12,
  },
  {
    slug: 'field-sales-marketing',
    level: 'role',
    nameEn: 'Field sales & marketing',
    nameMl: 'ഫീൽഡ് സെയിൽസ്, മാർക്കറ്റിംഗ്',
    parentSlug: 'commercial-operations',
    sortOrder: 13,
  },
  {
    slug: 'customer-support-front-office',
    level: 'role',
    nameEn: 'Customer support & front office',
    nameMl: 'കസ്റ്റമർ സപ്പോർട്ട്, ഫ്രണ്ട് ഓഫീസ്',
    parentSlug: 'commercial-operations',
    sortOrder: 14,
  },

  // =========================================================================
  // Tier 4 — Professional & office
  // =========================================================================
  {
    slug: 'professional-office',
    level: 'tier',
    nameEn: 'Professional & office',
    nameMl: 'പ്രൊഫഷണൽ, ഓഫീസ്',
    parentSlug: null,
    sortOrder: 4,
  },
  {
    slug: 'accountant',
    level: 'role',
    nameEn: 'Accountant',
    nameMl: 'അക്കൗണ്ടന്റ്',
    parentSlug: 'professional-office',
    sortOrder: 1,
  },
  {
    slug: 'chartered-accountant',
    level: 'role',
    nameEn: 'Chartered accountant',
    nameMl: 'ചാർട്ടേഡ് അക്കൗണ്ടന്റ്',
    parentSlug: 'professional-office',
    sortOrder: 2,
  },
  // 'ഓഡിറ്റർ' is the everyday Kerala word for a tax/accounts professional and
  // is kept as its own role even though it overlaps with the two above.
  {
    slug: 'auditor',
    level: 'role',
    nameEn: 'Auditor',
    nameMl: 'ഓഡിറ്റർ',
    parentSlug: 'professional-office',
    sortOrder: 3,
  },
  {
    slug: 'gst-tax-practitioner',
    level: 'role',
    nameEn: 'GST & tax practitioner',
    nameMl: 'ജി.എസ്.ടി., നികുതി പ്രാക്ടീഷണർ',
    parentSlug: 'professional-office',
    sortOrder: 4,
  },
  {
    slug: 'office-administrator',
    level: 'role',
    nameEn: 'Office administrator',
    nameMl: 'ഓഫീസ് അഡ്മിനിസ്ട്രേറ്റർ',
    parentSlug: 'professional-office',
    sortOrder: 5,
  },
  // Home tuition is folded into this role rather than being split out, to stay
  // inside the 14-role tier budget. Split it into its own 'private-tutor' role
  // if tuition turns out to be a distinct demand signal in practice.
  {
    slug: 'teacher',
    level: 'role',
    nameEn: 'Teacher & private tutor',
    nameMl: 'അധ്യാപകർ, ട്യൂഷൻ',
    parentSlug: 'professional-office',
    sortOrder: 6,
  },
  {
    slug: 'nurse',
    level: 'role',
    nameEn: 'Nurse',
    nameMl: 'നഴ്സ്',
    parentSlug: 'professional-office',
    sortOrder: 7,
  },
  {
    slug: 'lab-technician',
    level: 'role',
    nameEn: 'Lab technician',
    nameMl: 'ലാബ് ടെക്നീഷ്യൻ',
    parentSlug: 'professional-office',
    sortOrder: 8,
  },
  {
    slug: 'pharmacist',
    level: 'role',
    nameEn: 'Pharmacist',
    nameMl: 'ഫാർമസിസ്റ്റ്',
    parentSlug: 'professional-office',
    sortOrder: 9,
  },
  {
    slug: 'physiotherapist',
    level: 'role',
    nameEn: 'Physiotherapist',
    nameMl: 'ഫിസിയോതെറാപ്പിസ്റ്റ്',
    parentSlug: 'professional-office',
    sortOrder: 10,
  },
  {
    slug: 'civil-engineer-draughtsman',
    level: 'role',
    nameEn: 'Civil engineer & draughtsman',
    nameMl: 'സിവിൽ എൻജിനീയർ, ഡ്രാഫ്റ്റ്സ്മാൻ',
    parentSlug: 'professional-office',
    sortOrder: 11,
  },
  {
    slug: 'software-developer',
    level: 'role',
    nameEn: 'Software developer',
    nameMl: 'സോഫ്റ്റ്വെയർ ഡെവലപ്പർ',
    parentSlug: 'professional-office',
    sortOrder: 12,
  },
  {
    slug: 'graphic-designer',
    level: 'role',
    nameEn: 'Graphic designer',
    nameMl: 'ഗ്രാഫിക് ഡിസൈനർ',
    parentSlug: 'professional-office',
    sortOrder: 13,
  },
  {
    slug: 'digital-marketing',
    level: 'role',
    nameEn: 'Digital marketing',
    nameMl: 'ഡിജിറ്റൽ മാർക്കറ്റിംഗ്',
    parentSlug: 'professional-office',
    sortOrder: 14,
  },
];

// ===========================================================================
// 4. Anchor organisations
// ===========================================================================

export type SeedAnchorOrg = {
  nameEn: string;
  nameMl: string;
  type: 'merchant_assoc' | 'civic_club' | 'swayamsahaya' | 'residents_assoc';
  /** References a SeedLocality.key. */
  localityKey: string;
};

/**
 * Launch anchor only: the local merchants' and traders' association that
 * vouches for members. Seeded at the Edakkara panchayat level rather than at a
 * ward, because membership is panchayat-wide.
 *
 * PLACEHOLDER NAME. This is deliberately generic: the association's real
 * registered name must be entered before launch, because it is displayed to
 * members and sits behind a verified badge — a badge that names the wrong body
 * is worse than one that names none. Set the exact registered English name and
 * its Malayalam rendering with the association's office-bearers, then re-seed.
 */
export const SEED_ANCHOR_ORGS: SeedAnchorOrg[] = [
  {
    nameEn: "Local Traders' Association",
    nameMl: 'നാട്ടിലെ വ്യാപാരി സംഘടന',
    type: 'merchant_assoc',
    localityKey: 'kl-mpm-nilambur-edakkara',
  },
];
