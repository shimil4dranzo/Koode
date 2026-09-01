import type { NextRequest } from 'next/server';
import { created, handler } from '@/server/http/respond';
import { readJson, readMeta } from '@/server/http/request';
import { registerSchema } from '@/server/http/schemas';
import { registerPerson } from '@/server/services/auth.service';
import { createSession } from '@/server/auth/session';
import {
  clearVerificationTicket,
  requireVerifiedPhone,
} from '@/server/auth/verification-ticket';
import { resolveLocalityId } from '@/server/services/locality.service';

/**
 * POST /api/auth/register — create an account for an already-verified number.
 *
 * The phone number is taken from the signed verification ticket, never from
 * the request body. Consent is recorded in the same transaction as the
 * account: an account with no consent record is one we cannot lawfully justify
 * holding.
 */
export const POST = handler(async (request: NextRequest) => {
  const phone = await requireVerifiedPhone();
  const body = await readJson(request, registerSchema);
  const meta = readMeta(request);

  const localityId = body.localityPublicId
    ? await resolveLocalityId(body.localityPublicId)
    : null;

  const { personId, publicId } = await registerPerson(
    {
      phone,
      displayName: body.displayName,
      localityId,
      locale: body.locale,
      consentVersion: body.consentVersion,
    },
    meta,
  );

  await clearVerificationTicket();
  await createSession(personId, meta);

  return created({ status: 'signed_in', person: { publicId } });
});
