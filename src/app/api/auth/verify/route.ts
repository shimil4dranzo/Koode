import type { NextRequest } from 'next/server';
import { handler, ok } from '@/server/http/respond';
import { readJson, readMeta } from '@/server/http/request';
import { verifyOtpSchema } from '@/server/http/schemas';
import { resolveSignIn, verifyOtp } from '@/server/services/auth.service';
import { createSession } from '@/server/auth/session';
import { issueVerificationTicket } from '@/server/auth/verification-ticket';
import { AUDIT_ACTIONS, recordAuditSafely } from '@/server/audit';
import { CURRENT_CONSENT_VERSION } from '@/server/consent/versions';

/**
 * POST /api/auth/verify — check a one-time password.
 *
 * Three outcomes, mirroring the three states a phone number can be in:
 *
 *   { status: 'signed_in' }          session cookie set, go to the app
 *   { status: 'needs_registration' } first time here, collect name and consent
 *   { status: 'needs_consent' }      known person, consent text has changed
 *
 * The two "needs" outcomes do NOT set a session. A verified phone is not yet
 * an account: consent has to be recorded first, because an account we cannot
 * lawfully justify holding is worse than no account.
 */
export const POST = handler(async (request: NextRequest) => {
  const body = await readJson(request, verifyOtpSchema);
  const meta = readMeta(request);

  await verifyOtp(body.phone, body.code, 'login', meta);

  const outcome = await resolveSignIn(body.phone);

  if (outcome.kind === 'needs_registration' || outcome.kind === 'needs_consent') {
    // The code has been consumed, so the second step is authorised by a
    // short-lived signed ticket rather than by asking for the code again.
    await issueVerificationTicket(body.phone);

    return ok({ status: outcome.kind, consentVersion: CURRENT_CONSENT_VERSION });
  }

  await createSession(outcome.personId, meta);

  await recordAuditSafely({
    action: AUDIT_ACTIONS.PERSON_SIGNED_IN,
    actorPersonId: outcome.personId,
    entityType: 'person',
    entityId: outcome.publicId,
    context: meta,
  });

  return ok({ status: 'signed_in', person: { publicId: outcome.publicId } });
});
