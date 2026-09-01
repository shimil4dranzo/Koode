import { unstable_cache } from 'next/cache';
import type { Db } from '@/server/db/client';
import { prisma } from '@/server/db/client';
import { errors } from '@/server/errors';
import { newPublicId } from '@/server/ids';
import type { CategoryLevel } from '@/server/domain/constants';

/**
 * The work taxonomy: four tiers, each holding specific roles.
 *
 * The structural requirement from the brief, restated because it is easy to
 * erode: a chartered accountant and a loading worker are the same shape of
 * row. There is no "daily wage" field, no skill-level ranking, and no tier
 * that is treated as the default. A schema that quietly assumes low-skill work
 * would exclude half the people this is for.
 */

export type CategoryRef = {
  publicId: string;
  slug: string;
  level: CategoryLevel;
  nameEn: string;
  nameMl: string | null;
  parentPublicId: string | null;
  sortOrder: number;
};

export type CategoryGroup = {
  /** The tier. */
  publicId: string;
  label: string;
  roles: Array<{ publicId: string; label: string }>;
};

export async function resolveCategoryId(publicId: string, db: Db = prisma): Promise<bigint> {
  const category = await db.category.findUnique({
    where: { publicId },
    select: { id: true, isActive: true },
  });

  if (!category || !category.isActive) throw errors.notFound();
  return category.id;
}

async function loadAll(): Promise<CategoryRef[]> {
  const rows = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }],
    select: {
      publicId: true,
      slug: true,
      level: true,
      nameEn: true,
      nameMl: true,
      sortOrder: true,
      parent: { select: { publicId: true } },
    },
  });

  return rows.map((row) => ({
    publicId: row.publicId,
    slug: row.slug,
    level: row.level as CategoryLevel,
    nameEn: row.nameEn,
    nameMl: row.nameMl,
    parentPublicId: row.parent?.publicId ?? null,
    sortOrder: row.sortOrder,
  }));
}

/** Cached for an hour: the taxonomy changes only when an admin edits it. */
export const getAllCategories = unstable_cache(loadAll, ['categories'], {
  revalidate: 3600,
  tags: ['categories'],
});

export function categoryLabel(
  category: { nameEn: string; nameMl: string | null },
  locale: string,
): string {
  return locale === 'ml' ? (category.nameMl ?? category.nameEn) : category.nameEn;
}

/**
 * Roles grouped under their tier, for an `<optgroup>` select.
 *
 * Grouping matters for usability here: a flat list of fifty roles is unusable
 * on a phone, and the four tiers are how people already think about the work.
 */
export async function getCategoryGroups(locale: string): Promise<CategoryGroup[]> {
  const all = await getAllCategories();

  const tiers = all
    .filter((category) => category.level === 'tier')
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return tiers.map((tier) => ({
    publicId: tier.publicId,
    label: categoryLabel(tier, locale),
    roles: all
      .filter((category) => category.level === 'role' && category.parentPublicId === tier.publicId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((role) => ({ publicId: role.publicId, label: categoryLabel(role, locale) })),
  }));
}

/** Flat option list, tier prefixed, for contexts where optgroup is awkward. */
export async function getCategoryOptions(
  locale: string,
): Promise<Array<{ value: string; label: string }>> {
  const groups = await getCategoryGroups(locale);

  return groups.flatMap((group) =>
    group.roles.map((role) => ({
      value: role.publicId,
      label: `${group.label} · ${role.label}`,
    })),
  );
}

// ---------------------------------------------------------------------------
// Administration
// ---------------------------------------------------------------------------

export type CreateCategoryInput = {
  slug: string;
  level: CategoryLevel;
  nameEn: string;
  nameMl: string | null;
  parentPublicId: string | null;
  sortOrder?: number;
};

export async function createCategory(input: CreateCategoryInput): Promise<CategoryRef> {
  // Two levels only: a tier has no parent, a role must have one.
  if (input.level === 'tier' && input.parentPublicId) {
    throw errors.validation('errors.validationFailed');
  }
  if (input.level === 'role' && !input.parentPublicId) {
    throw errors.validation('errors.validationFailed');
  }

  let parentId: bigint | null = null;
  if (input.parentPublicId) {
    const parent = await prisma.category.findUnique({
      where: { publicId: input.parentPublicId },
      select: { id: true, level: true },
    });
    if (!parent) throw errors.notFound();
    // A role may not hang off another role — that would be a third level.
    if (parent.level !== 'tier') throw errors.validation('errors.validationFailed');
    parentId = parent.id;
  }

  const publicId = newPublicId();

  await prisma.category.create({
    data: {
      publicId,
      slug: input.slug,
      level: input.level,
      nameEn: input.nameEn.trim(),
      nameMl: input.nameMl?.trim() || null,
      parentId,
      sortOrder: input.sortOrder ?? 0,
    },
  });

  return {
    publicId,
    slug: input.slug,
    level: input.level,
    nameEn: input.nameEn.trim(),
    nameMl: input.nameMl?.trim() || null,
    parentPublicId: input.parentPublicId,
    sortOrder: input.sortOrder ?? 0,
  };
}

/**
 * Retire a category.
 *
 * Deactivates rather than deletes: requirements and person skills reference it,
 * and a deleted row would either break them or rewrite history. An inactive
 * category disappears from every picker but existing records still render.
 */
export async function deactivateCategory(publicId: string): Promise<void> {
  const category = await prisma.category.findUnique({
    where: { publicId },
    select: { id: true, level: true },
  });
  if (!category) throw errors.notFound();

  await prisma.$transaction(async (tx) => {
    await tx.category.update({ where: { id: category.id }, data: { isActive: false } });

    // Retiring a tier must take its roles with it, or they become orphans in
    // a picker with no group heading.
    if (category.level === 'tier') {
      await tx.category.updateMany({
        where: { parentId: category.id },
        data: { isActive: false },
      });
    }
  });
}
