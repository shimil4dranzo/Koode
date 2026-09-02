import type { NextRequest } from 'next/server';
import { handler, ok } from '@/server/http/respond';
import { readMeta } from '@/server/http/request';
import { requirePerson } from '@/server/auth/session';
import { revealCandidateContact } from '@/server/services/interest.service';

type RouteContext = { params: Promise<{ publicId: string }> };

/**
 * POST /api/interest/:id/contact — the poster asks to see a shortlisted
 * candidate's contact details. Sign-in required; the service checks that the
 * caller posted the opening and that the candidate is shortlisted.
 */
export const POST = handler(async (request: NextRequest, context: RouteContext) => {
  const { publicId } = await context.params;
  const employer = await requirePerson();

  const contact = await revealCandidateContact(publicId, employer, readMeta(request));

  return ok(contact, {
    headers: { 'Cache-Control': 'no-store, private' },
  });
});
