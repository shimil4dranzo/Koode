import type { NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { handler, ok } from '@/server/http/respond';
import { errors } from '@/server/errors';
import { env } from '@/server/env';
import { expireStaleRequirements } from '@/server/services/requirement.service';
import { expireUnclaimedProfiles } from '@/server/services/claim.service';
import { purgeExpiredOtpChallenges } from '@/server/services/auth.service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/maintenance — the scheduled housekeeping.
 *
 * Driven by cron rather than by a background worker: there is one host, the
 * jobs take seconds, and a curl in crontab is something the maintainer can
 * read, run by hand and reason about three years from now. See docs/RUNBOOK.md.
 *
 * The important one is `expireUnclaimedProfiles`. Section 6 requires that a
 * person who never responded to a claim invitation ends up with nothing of
 * theirs retained, and that only happens if this actually runs — so its result
 * is reported explicitly rather than being buried in a log.
 *
 * Authorised by a shared secret in the Authorization header, compared in
 * constant time. This endpoint is not user-facing and has no session.
 */
export const POST = handler(async (request: NextRequest) => {
  assertAuthorized(request);

  const [expiredRequirements, purgedProfiles, purgedOtps] = await Promise.all([
    expireStaleRequirements(),
    expireUnclaimedProfiles(),
    purgeExpiredOtpChallenges(),
  ]);

  return ok({
    expiredRequirements,
    purgedUnclaimedProfiles: purgedProfiles,
    purgedOtpChallenges: purgedOtps,
    ranAt: new Date().toISOString(),
  });
});

function assertAuthorized(request: NextRequest): void {
  const secret = process.env.MAINTENANCE_SECRET ?? '';

  if (!secret) {
    // Fail closed. An unauthenticated maintenance endpoint would let anyone
    // trigger data purges, so a missing secret disables it rather than
    // opening it.
    if (env.NODE_ENV === 'production') throw errors.forbidden();
    console.warn('[maintenance] MAINTENANCE_SECRET is not set; refusing to run.');
    throw errors.forbidden();
  }

  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);

  if (a.length !== b.length || !timingSafeEqual(a, b)) throw errors.forbidden();
}
