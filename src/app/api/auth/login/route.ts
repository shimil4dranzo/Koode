import type { NextRequest } from 'next/server';
import { handler, ok } from '@/server/http/respond';
import { readJson, readMeta } from '@/server/http/request';
import { loginSchema } from '@/server/http/schemas';
import { loginWithPassword } from '@/server/services/auth.service';
import { createSession } from '@/server/auth/session';
import { AUDIT_ACTIONS, recordAuditSafely } from '@/server/audit';
import { CURRENT_CONSENT_VERSION } from '@/server/consent/versions';

/**
 * POST /api/auth/login — e-mail and password.
 *
 * `needs_consent` gets no session, same principle as registration: the
 * consent text changed, and acting on the account before re-acceptance is
 * recorded would put the cart before the lawful basis. The client keeps the
 * credentials in memory and replays them through /api/auth/consent.
 */
export const POST = handler(async (request: NextRequest) => {
  const body = await readJson(request, loginSchema);
  const meta = readMeta(request);

  const outcome = await loginWithPassword(body.email, body.password, meta);

  if (outcome.kind === 'needs_consent') {
    return ok({ status: 'needs_consent', consentVersion: CURRENT_CONSENT_VERSION });
  }

  await createSession(outcome.personId, meta);

  await recordAuditSafely({
    action: AUDIT_ACTIONS.PERSON_SIGNED_IN,
    actorPersonId: outcome.personId,
    entityType: 'person',
    entityId: outcome.publicId,
    metadata: { method: 'password' },
    context: meta,
  });

  return ok({ status: 'signed_in', person: { publicId: outcome.publicId } });
});
