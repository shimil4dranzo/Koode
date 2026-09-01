import type { NextRequest } from 'next/server';
import { handler, noContent } from '@/server/http/respond';
import { readMeta, readQuery } from '@/server/http/request';
import { revokeMembershipQuerySchema } from '@/server/http/schemas';
import { revokeMembership, verifyMembership } from '@/server/services/anchor.service';
import { requirePerson } from '@/server/auth/session';

type RouteContext = { params: Promise<{ publicId: string; personPublicId: string }> };

/**
 * POST   /api/anchors/:id/members/:personId — confirm this person belongs
 * DELETE /api/anchors/:id/members/:personId — withdraw that confirmation
 *
 * Both are the same authority question, answered in the service: an
 * office-bearer of this organisation, or a platform admin. A moderator is
 * deliberately not enough — moderation is about content, membership is about
 * the association's own records.
 */
export const POST = handler(async (request: NextRequest, context: RouteContext) => {
  const { publicId, personPublicId } = await context.params;
  const actor = await requirePerson();

  await verifyMembership(publicId, personPublicId, actor, readMeta(request));

  return noContent();
});

export const DELETE = handler(async (request: NextRequest, context: RouteContext) => {
  const { publicId, personPublicId } = await context.params;
  const actor = await requirePerson();
  const query = readQuery(request, revokeMembershipQuerySchema);

  await revokeMembership(
    publicId,
    personPublicId,
    query.reason ?? null,
    actor,
    readMeta(request),
  );

  return noContent();
});
