import type { NextRequest } from 'next/server';
import { handler, noContent } from '@/server/http/respond';
import { readJson, readMeta } from '@/server/http/request';
import { setHiddenSchema } from '@/server/http/schemas';
import { setHidden } from '@/server/services/moderation.service';
import { requirePerson } from '@/server/auth/session';

/**
 * POST /api/moderation/hide — hide or restore reported content.
 *
 * One route for both directions, because they are the same decision written
 * twice: `hidden: false` is what makes a moderation mistake recoverable, and
 * splitting it into a second endpoint invites one of the two to be forgotten.
 * Nothing is deleted either way.
 */
export const POST = handler(async (request: NextRequest) => {
  const actor = await requirePerson();
  const body = await readJson(request, setHiddenSchema);

  await setHidden(
    body.entityType,
    body.entityId,
    body.hidden,
    body.reason ?? null,
    actor,
    readMeta(request),
  );

  return noContent();
});
