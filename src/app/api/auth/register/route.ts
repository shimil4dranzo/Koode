import type { NextRequest } from 'next/server';
import { created, handler } from '@/server/http/respond';
import { readJson, readMeta } from '@/server/http/request';
import { registerSchema } from '@/server/http/schemas';
import { registerWithPassword } from '@/server/services/auth.service';
import { createSession } from '@/server/auth/session';
import { resolveLocalityId } from '@/server/services/locality.service';
import { enforceRateLimit } from '@/server/ratelimit';
import { hashIp } from '@/server/crypto';

/**
 * POST /api/auth/register — create an account with e-mail and password.
 *
 * Consent is recorded in the same transaction as the account, and the session
 * starts immediately: there is no e-mail provider yet, so there is no
 * verification mail to wait for — a consequence of the identity decision
 * recorded in ARCHITECTURE.md, alongside the absence of password reset.
 */
export const POST = handler(async (request: NextRequest) => {
  const body = await readJson(request, registerSchema);
  const meta = readMeta(request);

  if (meta.ip) await enforceRateLimit('anonymousWrite', hashIp(meta.ip) ?? 'unknown');

  const localityId = body.localityPublicId
    ? await resolveLocalityId(body.localityPublicId)
    : null;

  const { personId, publicId } = await registerWithPassword(
    {
      email: body.email,
      password: body.password,
      displayName: body.displayName,
      accountType: body.accountType,
      localityId,
      locale: body.locale,
      consentVersion: body.consentVersion,
    },
    meta,
  );

  await createSession(personId, meta);

  return created({ status: 'signed_in', person: { publicId } });
});
