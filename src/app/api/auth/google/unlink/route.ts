import type { NextRequest } from 'next/server';
import { handler, noContent } from '@/server/http/respond';
import { readMeta } from '@/server/http/request';
import { requirePerson } from '@/server/auth/session';
import { prisma } from '@/server/db/client';
import { AUDIT_ACTIONS, recordAudit } from '@/server/audit';

/**
 * POST /api/auth/google/unlink — detach Google from the signed-in account.
 *
 * Always safe: the phone number is the identity, so removing the convenience
 * credential can never lock anyone out — the SMS path remains. The stored
 * e-mail goes with it; there is no reason to keep it once the link is gone.
 */
export const POST = handler(async (request: NextRequest) => {
  const person = await requirePerson();

  await prisma.$transaction(async (tx) => {
    await tx.person.update({
      where: { id: person.id },
      data: { googleSub: null, email: null },
    });
    await recordAudit(
      {
        action: AUDIT_ACTIONS.GOOGLE_UNLINKED,
        actorPersonId: person.id,
        entityType: 'person',
        entityId: person.publicId,
        context: readMeta(request),
      },
      tx,
    );
  });

  return noContent();
});
