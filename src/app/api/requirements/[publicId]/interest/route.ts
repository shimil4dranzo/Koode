import type { NextRequest } from 'next/server';
import { created, handler, ok } from '@/server/http/respond';
import { readJson, readMeta } from '@/server/http/request';
import { expressInterestSchema } from '@/server/http/schemas';
import { expressInterest, listInterestedCandidates } from '@/server/services/interest.service';
import { requirePerson } from '@/server/auth/session';
import { resolveLocale } from '@/server/http/locale';

type RouteContext = { params: Promise<{ publicId: string }> };

/**
 * GET  /api/requirements/:id/interest — who raised their hand (employer only)
 * POST /api/requirements/:id/interest — raise your hand
 *
 * The GET response carries each candidate's recommendations. That is the
 * moment the product exists for: a named vouch in front of the person deciding
 * whether to call. It still carries no phone numbers — reaching a candidate
 * goes through the audited reveal path like everything else.
 */
export const GET = handler(async (request: NextRequest, context: RouteContext) => {
  const { publicId } = await context.params;
  const employer = await requirePerson();

  const candidates = await listInterestedCandidates(
    publicId,
    employer,
    resolveLocale(request),
  );

  return ok({ candidates }, { headers: { 'Cache-Control': 'no-store, private' } });
});

export const POST = handler(async (request: NextRequest, context: RouteContext) => {
  const { publicId } = await context.params;
  const candidate = await requirePerson();

  // The note is optional, and so is the body.
  const body = await readJson(request, expressInterestSchema).catch(() => ({
    note: null,
  }));

  const result = await expressInterest(
    publicId,
    body.note ?? null,
    candidate,
    readMeta(request),
  );

  return created(result);
});
