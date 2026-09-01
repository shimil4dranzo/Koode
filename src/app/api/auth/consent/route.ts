import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handler, ok } from '@/server/http/respond';
import { readJson, readMeta } from '@/server/http/request';
import { emailSchema, localeSchema } from '@/server/http/schemas';
import { acceptConsent, loginWithPassword } from '@/server/services/auth.service';
import { createSession, getCurrentPerson } from '@/server/auth/session';
import { CURRENT_CONSENT_VERSION } from '@/server/consent/versions';
import { errors } from '@/server/errors';

const schema = z.object({
  locale: localeSchema,
  consentVersion: z.string().min(1),
  /** Present when re-consent interrupted a password sign-in. */
  email: emailSchema.optional(),
  password: z.string().min(1).max(200).optional(),
});

/**
 * POST /api/auth/consent — accept the current consent version.
 *
 * Two ways in: already signed in and the text changed, or a password sign-in
 * that was interrupted by `needs_consent` — the client resubmits the
 * credentials together with the acceptance, so consent lands before any
 * session exists.
 */
export const POST = handler(async (request: NextRequest) => {
  const body = await readJson(request, schema);
  const meta = readMeta(request);

  if (body.consentVersion !== CURRENT_CONSENT_VERSION) {
    throw errors.validation('errors.consentRequired');
  }

  const signedIn = await getCurrentPerson();
  if (signedIn) {
    await acceptConsent(signedIn.id, signedIn.publicId, body.locale, meta);
    return ok({ status: 'signed_in', person: { publicId: signedIn.publicId } });
  }

  if (!body.email || !body.password) throw errors.unauthenticated();

  // Re-verifies the password: the acceptance must be tied to a person who
  // just proved they are the account holder, not to whoever holds the tab.
  const outcome = await loginWithPassword(body.email, body.password, meta);

  await acceptConsent(outcome.personId, outcome.publicId, body.locale, meta);
  await createSession(outcome.personId, meta);

  return ok({ status: 'signed_in', person: { publicId: outcome.publicId } });
});
