import type { NextRequest } from 'next/server';
import { handler, noContent } from '@/server/http/respond';
import { readJson, readMeta } from '@/server/http/request';
import { updateInterestSchema } from '@/server/http/schemas';
import { updateInterestStatus } from '@/server/services/interest.service';
import { requirePerson } from '@/server/auth/session';

type RouteContext = { params: Promise<{ publicId: string }> };

/**
 * PATCH /api/interest/:id — shortlist, decline, or withdraw.
 *
 * Who may do what is decided in the service: the employer shortlists or
 * declines, the candidate withdraws, and neither can perform the other's
 * action.
 */
export const PATCH = handler(async (request: NextRequest, context: RouteContext) => {
  const { publicId } = await context.params;
  const actor = await requirePerson();
  const body = await readJson(request, updateInterestSchema);

  await updateInterestStatus(publicId, body.status, actor, readMeta(request));

  return noContent();
});
