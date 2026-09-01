import type { NextRequest } from 'next/server';
import { handler, noContent, ok } from '@/server/http/respond';
import { readJson, readMeta, readQuery } from '@/server/http/request';
import { listMembershipsQuerySchema, requestMembershipSchema } from '@/server/http/schemas';
import { listMemberships, requestMembership } from '@/server/services/anchor.service';
import { requirePerson } from '@/server/auth/session';
import { resolveLocale } from '@/server/http/locale';

type RouteContext = { params: Promise<{ publicId: string }> };

/**
 * GET  /api/anchors/:id/members — the roll, for somebody entitled to see it
 * POST /api/anchors/:id/members — ask this organisation to confirm you
 *
 * Unlike the organisation list, the roll is not public: who belongs to the
 * merchants' association is the association's own record. The service decides
 * who may read it — an office-bearer of that organisation, or a platform
 * admin — so a moderator cannot quietly enumerate the membership.
 */
export const GET = handler(async (request: NextRequest, context: RouteContext) => {
  const { publicId } = await context.params;
  const actor = await requirePerson();
  const query = readQuery(request, listMembershipsQuerySchema);

  const members = await listMemberships(
    publicId,
    query.status,
    actor,
    resolveLocale(request),
  );

  return ok({ members }, { headers: { 'Cache-Control': 'no-store, private' } });
});

export const POST = handler(async (request: NextRequest, context: RouteContext) => {
  const { publicId } = await context.params;
  const person = await requirePerson();

  // The membership number is optional, and so is the body.
  const body = await readJson(request, requestMembershipSchema).catch(() => ({
    membershipRef: null,
  }));

  await requestMembership(publicId, body.membershipRef ?? null, person, readMeta(request));

  return noContent();
});
