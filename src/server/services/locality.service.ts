import { unstable_cache } from 'next/cache';
import type { Db } from '@/server/db/client';
import { prisma } from '@/server/db/client';
import { errors } from '@/server/errors';
import { newPublicId } from '@/server/ids';
import type { LocalityLevel } from '@/server/domain/constants';

/**
 * Localities: the place tree, and the "nearby" question the tree cannot answer.
 *
 * Two distinct mechanisms, easily confused:
 *
 *   PATH      — ancestry. "Everything inside Nilambur block" is one indexed
 *               LIKE against the materialised path, no recursion.
 *
 *   ADJACENCY — bordering. "Edakkara and the panchayats next to it" is a
 *               lookup in locality_adjacency, because a tree cannot express
 *               it: two panchayats under one block do not necessarily border
 *               each other, and real neighbours cross block and district
 *               lines.
 *
 * Using the first to answer the second is the mistake to avoid. It looks
 * plausible and returns wrong results quietly.
 */

export type LocalityRef = {
  publicId: string;
  level: LocalityLevel;
  nameEn: string;
  nameMl: string | null;
  parentPublicId: string | null;
  depth: number;
};

export type LocalityOption = {
  publicId: string;
  /** Already resolved to the requested locale, with an English fallback. */
  label: string;
  level: LocalityLevel;
  depth: number;
};

/** Internal id for a public id, or a 404. */
export async function resolveLocalityId(publicId: string, db: Db = prisma): Promise<bigint> {
  const locality = await db.locality.findUnique({
    where: { publicId },
    select: { id: true, isActive: true },
  });

  if (!locality || !locality.isActive) throw errors.notFound();
  return locality.id;
}

/**
 * The set of locality ids a search should cover.
 *
 * Without `includeNearby`: the selected locality and everything beneath it, so
 * choosing a panchayat also matches requirements posted against one of its
 * wards.
 *
 * With `includeNearby`: the above, plus the same for every locality that
 * borders the selected one.
 *
 * Returns internal ids because it feeds straight into a Prisma `in` filter.
 */
export async function getSearchLocalityIds(
  localityId: bigint,
  includeNearby: boolean,
  db: Db = prisma,
): Promise<bigint[]> {
  const root = await db.locality.findUnique({
    where: { id: localityId },
    select: { id: true, path: true },
  });
  if (!root) throw errors.notFound();

  const paths = [root.path];

  if (includeNearby) {
    const neighbours = await db.localityAdjacency.findMany({
      where: { localityId },
      select: { neighbour: { select: { path: true } } },
    });
    for (const edge of neighbours) paths.push(edge.neighbour.path);
  }

  // `path` is '/1/4/12/', so a descendant's path starts with the ancestor's.
  // startsWith compiles to LIKE 'prefix%', which uses the index on `path`.
  const matches = await db.locality.findMany({
    where: { OR: paths.map((path) => ({ path: { startsWith: path } })) },
    select: { id: true },
  });

  return matches.map((row) => row.id);
}

/** Every locality, ordered for rendering as an indented list. */
async function loadAll(): Promise<LocalityRef[]> {
  const rows = await prisma.locality.findMany({
    where: { isActive: true },
    orderBy: [{ depth: 'asc' }, { nameEn: 'asc' }],
    select: {
      publicId: true,
      level: true,
      nameEn: true,
      nameMl: true,
      depth: true,
      parent: { select: { publicId: true } },
    },
  });

  return rows.map((row) => ({
    publicId: row.publicId,
    level: row.level as LocalityLevel,
    nameEn: row.nameEn,
    nameMl: row.nameMl,
    parentPublicId: row.parent?.publicId ?? null,
    depth: row.depth,
  }));
}

/**
 * Cached for an hour. The place tree changes when a panchayat is added, which
 * is roughly never, and every page with a locality filter would otherwise
 * re-read the whole table.
 */
export const getAllLocalities = unstable_cache(loadAll, ['localities'], {
  revalidate: 3600,
  tags: ['localities'],
});

/**
 * Options for a `<select>`, in the user's language.
 *
 * Defaults to panchayat level and below: state and district are not useful
 * choices when every user is in one taluk, and offering them would produce
 * searches that return the whole database.
 */
export async function getLocalityOptions(
  locale: string,
  levels: LocalityLevel[] = ['panchayat', 'ward'],
): Promise<LocalityOption[]> {
  const all = await getAllLocalities();

  return all
    .filter((locality) => levels.includes(locality.level))
    .map((locality) => ({
      publicId: locality.publicId,
      // Fall back to English rather than showing nothing if a Malayalam name
      // is missing — a blank option is worse than the wrong language.
      label: locale === 'ml' ? (locality.nameMl ?? locality.nameEn) : locality.nameEn,
      level: locality.level,
      depth: locality.depth,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, locale));
}

/**
 * Search scopes, from hyperlocal outward.
 *
 * `local` is panchayat/municipality level — the granularity people actually
 * hire at, and the only level with adjacency data. The wider scopes reuse the
 * same subtree search: picking a district matches everything inside it via the
 * materialised path, no special casing. There is no `country` scope because
 * the tree's root is the state; the day Koode leaves Kerala, add the node and
 * the scope, in that order.
 */
export const SEARCH_SCOPES = ['local', 'block', 'district', 'state'] as const;
export type SearchScope = (typeof SEARCH_SCOPES)[number];

const LEVELS_BY_SCOPE: Record<SearchScope, LocalityLevel[]> = {
  local: ['panchayat', 'ward'],
  block: ['block'],
  district: ['district'],
  state: ['state'],
};

/** Locality options for each search scope, in the user's language. */
export async function getLocalityOptionsByScope(
  locale: string,
): Promise<Record<SearchScope, LocalityOption[]>> {
  const entries = await Promise.all(
    SEARCH_SCOPES.map(
      async (scope) =>
        [scope, await getLocalityOptions(locale, LEVELS_BY_SCOPE[scope])] as const,
    ),
  );

  return Object.fromEntries(entries) as Record<SearchScope, LocalityOption[]>;
}

/** Which scope a locality level belongs to, for restoring filter state. */
export function scopeForLevel(level: LocalityLevel): SearchScope {
  switch (level) {
    case 'panchayat':
    case 'ward':
      return 'local';
    default:
      return level;
  }
}

export function localityLabel(
  locality: { nameEn: string; nameMl: string | null },
  locale: string,
): string {
  return locale === 'ml' ? (locality.nameMl ?? locality.nameEn) : locality.nameEn;
}

// ---------------------------------------------------------------------------
// Administration
// ---------------------------------------------------------------------------

export type CreateLocalityInput = {
  level: LocalityLevel;
  nameEn: string;
  nameMl: string | null;
  parentPublicId: string | null;
};

/**
 * Create a locality and set its materialised path.
 *
 * The path contains the row's own id, which does not exist until after the
 * insert, so this is a two-statement operation inside one transaction. Doing
 * it in two separate calls would leave a row with an empty path visible to a
 * concurrent search.
 */
export async function createLocality(input: CreateLocalityInput): Promise<LocalityRef> {
  return prisma.$transaction(async (tx) => {
    let parentPath = '/';
    let parentId: bigint | null = null;
    let depth = 0;

    if (input.parentPublicId) {
      const parent = await tx.locality.findUnique({
        where: { publicId: input.parentPublicId },
        select: { id: true, path: true, depth: true },
      });
      if (!parent) throw errors.notFound();

      parentId = parent.id;
      parentPath = parent.path;
      depth = parent.depth + 1;
    }

    const publicId = newPublicId();
    const createdRow = await tx.locality.create({
      data: {
        publicId,
        level: input.level,
        nameEn: input.nameEn.trim(),
        nameMl: input.nameMl?.trim() || null,
        parentId,
        depth,
        path: '', // replaced below, inside this transaction
      },
      select: { id: true },
    });

    const path = `${parentPath}${createdRow.id}/`;
    await tx.locality.update({ where: { id: createdRow.id }, data: { path } });

    return {
      publicId,
      level: input.level,
      nameEn: input.nameEn.trim(),
      nameMl: input.nameMl?.trim() || null,
      parentPublicId: input.parentPublicId,
      depth,
    };
  });
}

/**
 * Record that two localities border each other.
 *
 * Written in both directions so a nearby query never has to check two columns.
 * Idempotent, so re-running the seed does not fail.
 */
export async function linkAdjacentLocalities(
  aPublicId: string,
  bPublicId: string,
): Promise<void> {
  if (aPublicId === bPublicId) {
    throw errors.validation('errors.validationFailed');
  }

  const [a, b] = await Promise.all([
    resolveLocalityId(aPublicId),
    resolveLocalityId(bPublicId),
  ]);

  await prisma.localityAdjacency.createMany({
    data: [
      { localityId: a, neighbourId: b },
      { localityId: b, neighbourId: a },
    ],
    skipDuplicates: true,
  });
}
