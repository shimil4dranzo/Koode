import type { NextRequest } from 'next/server';
import { handler, ok } from '@/server/http/respond';
import { readJson, readMeta } from '@/server/http/request';
import { claimDecisionSchema } from '@/server/http/schemas';
import { decideClaim, getClaimPreview, requestClaimOtp } from '@/server/services/claim.service';
import { z } from 'zod';

type RouteContext = { params: Promise<{ token: string }> };

/**
 * GET  /api/claim/:token — what the subject is being asked to agree to
 * POST /api/claim/:token — request a code, or accept / reject
 *
 * The GET is unauthenticated by design: the person has no account yet, and the
 * token in the URL is the only thing identifying them. It returns the
 * referrer's name and the note verbatim, and only a MASKED phone number — a
 * forwarded link must not disclose the full number to whoever received it.
 *
 * Acting on the invitation always requires an OTP, so possession of the link
 * alone is never enough to accept or reject on somebody's behalf.
 */
export const GET = handler(async (_request: NextRequest, context: RouteContext) => {
  const { token } = await context.params;

  const preview = await getClaimPreview(token);

  return ok(preview, {
    // Never cache: this is one person's personal data, keyed by a secret.
    headers: { 'Cache-Control': 'no-store, private' },
  });
});

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('request_code') }),
  z.object({
    action: z.literal('decide'),
    ...claimDecisionSchema.omit({ token: true }).shape,
  }),
]);

export const POST = handler(async (request: NextRequest, context: RouteContext) => {
  const { token } = await context.params;
  const body = await readJson(request, actionSchema);

  if (body.action === 'request_code') {
    const result = await requestClaimOtp(token);
    return ok(result);
  }

  const result = await decideClaim(
    {
      token,
      code: body.code,
      decision: body.decision,
      displayName: body.displayName,
      locale: body.locale,
    },
    readMeta(request),
  );

  return ok(result, { headers: { 'Cache-Control': 'no-store, private' } });
});
