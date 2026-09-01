import type { NextRequest } from 'next/server';
import { created, handler } from '@/server/http/respond';
import { readJson, readMeta } from '@/server/http/request';
import { createRecommendationSchema } from '@/server/http/schemas';
import { createRecommendation } from '@/server/services/recommendation.service';
import { requirePerson } from '@/server/auth/session';

/**
 * POST /api/recommendations — put your name behind somebody.
 *
 * Two shapes of request:
 *   { subjectPublicId, ... }              an existing Koode user
 *   { subjectPhone, subjectName, ... }    somebody not on Koode yet
 *
 * The second creates a `pending_claim` profile and sends an invitation. It is
 * refused with CAPABILITY_DISABLED unless ALLOW_RECOMMENDING_NON_USERS is on,
 * because the invitation is what protects that person and it cannot be
 * delivered while SMS is a console stub.
 */
export const POST = handler(async (request: NextRequest) => {
  const referrer = await requirePerson();
  const body = await readJson(request, createRecommendationSchema);

  const result = await createRecommendation(
    {
      subjectPublicId: body.subjectPublicId,
      subjectPhone: body.subjectPhone,
      subjectName: body.subjectName,
      relationshipContext: body.relationshipContext,
      categoryPublicId: body.categoryPublicId,
      note: body.note,
    },
    referrer,
    readMeta(request),
  );

  return created(result);
});
