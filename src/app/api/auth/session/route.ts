import type { NextRequest } from 'next/server';
import { handler, noContent, ok } from '@/server/http/respond';
import { readMeta } from '@/server/http/request';
import { destroySession, getCurrentPerson } from '@/server/auth/session';
import { AUDIT_ACTIONS, recordAuditSafely } from '@/server/audit';

/**
 * GET  /api/auth/session — who is signed in
 * DELETE /api/auth/session — sign out
 *
 * The GET response mirrors `CurrentPerson`, which has no phone field. A native
 * wrapper or a bot asking "who am I" gets exactly what a Server Component
 * gets, and neither can reach the number without going through the audited
 * reveal endpoint.
 */
export const GET = handler(async () => {
  const person = await getCurrentPerson();

  if (!person) return ok({ person: null });

  return ok({
    person: {
      publicId: person.publicId,
      displayName: person.displayName,
      status: person.status,
      platformRole: person.platformRole,
      hasVerifiedMembership: person.hasVerifiedMembership,
    },
  });
});

export const DELETE = handler(async (request: NextRequest) => {
  const person = await getCurrentPerson();

  await destroySession();

  if (person) {
    await recordAuditSafely({
      action: AUDIT_ACTIONS.PERSON_SIGNED_OUT,
      actorPersonId: person.id,
      entityType: 'person',
      entityId: person.publicId,
      context: readMeta(request),
    });
  }

  return noContent();
});
