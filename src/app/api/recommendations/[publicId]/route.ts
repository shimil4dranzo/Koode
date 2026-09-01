import type { NextRequest } from 'next/server';
import { handler, noContent } from '@/server/http/respond';
import { readJson, readMeta } from '@/server/http/request';
import { withdrawRecommendationSchema } from '@/server/http/schemas';
import { withdrawRecommendation } from '@/server/services/recommendation.service';
import { requirePerson } from '@/server/auth/session';

type RouteContext = { params: Promise<{ publicId: string }> };

/**
 * DELETE /api/recommendations/:id — withdraw one.
 *
 * Soft. The row and its history are retained; only the display stops. Notes
 * are immutable, so withdrawing and writing a new one is how a referrer
 * corrects themselves — and the trail shows that they changed their mind
 * rather than quietly rewriting what they said.
 *
 * Author only. A subject who objects rejects the claim or reports it.
 */
export const DELETE = handler(async (request: NextRequest, context: RouteContext) => {
  const { publicId } = await context.params;
  const person = await requirePerson();

  // A reason is optional, and so is the body itself.
  const body = await readJson(request, withdrawRecommendationSchema).catch(() => ({
    reason: undefined,
  }));

  await withdrawRecommendation(publicId, body.reason, person, readMeta(request));

  return noContent();
});
