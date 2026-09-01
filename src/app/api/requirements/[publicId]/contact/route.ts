import type { NextRequest } from 'next/server';
import { handler, ok } from '@/server/http/respond';
import { readMeta } from '@/server/http/request';
import { revealContact } from '@/server/services/requirement.service';
import { getCurrentPerson } from '@/server/auth/session';

type RouteContext = { params: Promise<{ publicId: string }> };

/**
 * POST /api/requirements/:id/contact — reveal the employer's phone number.
 *
 * The single endpoint in the product that returns a phone number, and the only
 * caller of the single service function that selects one.
 *
 * POST, not GET, on purpose: this has a side effect (an audit record), it must
 * never be cached or prefetched, and a link a browser might follow
 * speculatively must not be able to trigger it.
 */
export const POST = handler(async (request: NextRequest, context: RouteContext) => {
  const { publicId } = await context.params;
  // Optional on purpose: seekers browse without accounts. Anonymous reveals
  // are rate-limited per IP and audited with a hashed IP.
  const person = await getCurrentPerson();

  const contact = await revealContact(publicId, person, readMeta(request));

  return ok(contact, {
    headers: { 'Cache-Control': 'no-store, private' },
  });
});
