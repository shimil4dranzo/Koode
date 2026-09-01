import type { NextRequest } from 'next/server';
import { handler, noContent } from '@/server/http/respond';
import { readJson, readMeta } from '@/server/http/request';
import { requirementStatusSchema } from '@/server/http/schemas';
import { transitionRequirement } from '@/server/services/requirement.service';
import { requirePerson } from '@/server/auth/session';

type RouteContext = { params: Promise<{ publicId: string }> };

/**
 * POST /api/requirements/:id/status — move a requirement to a terminal state.
 *
 * Moving to `filled` runs the Section 5 invariant: it fails unless at least
 * one Engagement has been recorded. That refusal is the point — it is what
 * makes the outcome data worth having.
 */
export const POST = handler(async (request: NextRequest, context: RouteContext) => {
  const { publicId } = await context.params;
  const person = await requirePerson();
  const body = await readJson(request, requirementStatusSchema);

  await transitionRequirement(publicId, body.status, person, readMeta(request));

  return noContent();
});
