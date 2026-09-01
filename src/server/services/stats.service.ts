import { unstable_cache } from 'next/cache';
import { prisma } from '@/server/db/client';

/**
 * The only counts Stage 1 exposes. Section 4 rules out analytics dashboards;
 * these three numbers exist to make the home page feel inhabited, not to
 * measure anything.
 *
 * Cached for five minutes: they are decorative, and a cold home page should
 * not cost three aggregate queries per visitor.
 */
export type PlatformCounts = {
  openRequirements: number;
  activePeople: number;
  recommendations: number;
};

const ZERO: PlatformCounts = { openRequirements: 0, activePeople: 0, recommendations: 0 };

async function countAll(): Promise<PlatformCounts> {
  const now = new Date();

  try {
    const [openRequirements, activePeople, recommendations] = await Promise.all([
      prisma.requirement.count({
        where: { status: 'open', hiddenAt: null, expiresAt: { gt: now } },
      }),
      // `pending_claim` people are excluded: they are not public, and counting
      // them would let the number reveal how many unclaimed profiles exist.
      prisma.person.count({ where: { status: 'active', anonymizedAt: null } }),
      prisma.recommendation.count({ where: { status: 'active', hiddenAt: null } }),
    ]);

    return { openRequirements, activePeople, recommendations };
  } catch (error) {
    // These numbers are decorative. Letting them take the home page down —
    // or fail a CI build that has no database — would be a poor trade.
    console.error(
      '[stats] count query failed, rendering zeros:',
      error instanceof Error ? error.message : 'unknown error',
    );
    return ZERO;
  }
}

export const getPlatformCounts = unstable_cache(countAll, ['platform-counts'], {
  revalidate: 300,
  tags: ['platform-counts'],
});
