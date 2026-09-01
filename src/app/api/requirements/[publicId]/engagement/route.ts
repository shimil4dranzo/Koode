import type { NextRequest } from 'next/server';
import { created, handler } from '@/server/http/respond';
import { readJson, readMeta } from '@/server/http/request';
import { recordEngagementSchema } from '@/server/http/schemas';
import { recordEngagement } from '@/server/services/interest.service';
import { requirePerson } from '@/server/auth/session';

type RouteContext = { params: Promise<{ publicId: string }> };

/**
 * POST /api/requirements/:id/engagement — record what happened.
 *
 * This is the raw material Stage 2 will compute referrer credibility from.
 * Nothing is computed from it today, and it is deliberately not shown to
 * anyone as a score — the brief rules out public ratings, and an outcome
 * recorded honestly is worth more than one recorded defensively.
 *
 * Recording an engagement is also the precondition for marking a requirement
 * `filled`; see the invariant in src/server/domain/requirement/rules.ts.
 */
export const POST = handler(async (request: NextRequest, context: RouteContext) => {
  const { publicId } = await context.params;
  const employer = await requirePerson();
  const body = await readJson(request, recordEngagementSchema);

  const result = await recordEngagement(
    publicId,
    {
      personPublicId: body.personPublicId,
      outcome: body.outcome,
      note: body.note ?? null,
    },
    employer,
    readMeta(request),
  );

  return created(result);
});
