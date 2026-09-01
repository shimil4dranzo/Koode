import type { NextRequest } from 'next/server';
import { handler, ok } from '@/server/http/respond';
import { readJson, readMeta } from '@/server/http/request';
import { acceptConsentSchema } from '@/server/http/schemas';
import { acceptConsent, resolveSignIn } from '@/server/services/auth.service';
import { createSession, getCurrentPerson } from '@/server/auth/session';
import {
  clearVerificationTicket,
  requireVerifiedPhone,
} from '@/server/auth/verification-ticket';
import { CURRENT_CONSENT_VERSION } from '@/server/consent/versions';
import { errors } from '@/server/errors';

/**
 * POST /api/auth/consent — record acceptance of the current consent version.
 *
 * Reached two ways:
 *  - already signed in, and the consent text has since changed
 *  - just verified a number, holding a verification ticket, for an existing
 *    account whose accepted version is out of date
 */
export const POST = handler(async (request: NextRequest) => {
  const body = await readJson(request, acceptConsentSchema);
  const meta = readMeta(request);

  if (body.consentVersion !== CURRENT_CONSENT_VERSION) {
    throw errors.validation('errors.consentRequired');
  }

  const signedIn = await getCurrentPerson();

  if (signedIn) {
    await acceptConsent(signedIn.id, signedIn.publicId, body.locale, meta);
    return ok({ status: 'signed_in', person: { publicId: signedIn.publicId } });
  }

  const phone = await requireVerifiedPhone();
  const outcome = await resolveSignIn(phone);

  if (outcome.kind === 'needs_registration') {
    // No account for this number — the client should be on the registration
    // form, not here.
    throw errors.validation('errors.validationFailed');
  }

  await acceptConsent(outcome.personId, outcome.publicId, body.locale, meta);
  await clearVerificationTicket();
  await createSession(outcome.personId, meta);

  return ok({ status: 'signed_in', person: { publicId: outcome.publicId } });
});
