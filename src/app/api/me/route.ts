import type { NextRequest } from 'next/server';
import { handler, noContent, ok } from '@/server/http/respond';
import { readJson, readMeta } from '@/server/http/request';
import { updateProfileSchema } from '@/server/http/schemas';
import { deleteAccount, getOwnMaskedPhone, updateProfile } from '@/server/services/person.service';
import { requirePerson } from '@/server/auth/session';

/**
 * GET    /api/me — the signed-in person's own profile
 * PATCH  /api/me — edit it
 * DELETE /api/me — delete the account
 *
 * The GET returns the phone MASKED, not in full. Even on your own settings
 * page there is no reason to render the whole number — masked is enough to
 * confirm which number is on file, and it keeps the full value out of one more
 * response body. The complete number is available from the export endpoint.
 */
export const GET = handler(async () => {
  const person = await requirePerson();

  return ok(
    {
      publicId: person.publicId,
      displayName: person.displayName,
      status: person.status,
      platformRole: person.platformRole,
      hasVerifiedMembership: person.hasVerifiedMembership,
      maskedPhone: await getOwnMaskedPhone(person),
    },
    { headers: { 'Cache-Control': 'no-store, private' } },
  );
});

export const PATCH = handler(async (request: NextRequest) => {
  const person = await requirePerson();
  const body = await readJson(request, updateProfileSchema);

  await updateProfile(body, person, readMeta(request));

  return noContent();
});

/**
 * Anonymises rather than destroying: personal columns are nulled and the row
 * survives, so recommendation history stays statistically intact and the audit
 * trail keeps no holes. See deleteAccount for exactly what goes and what stays.
 */
export const DELETE = handler(async (request: NextRequest) => {
  const person = await requirePerson();

  await deleteAccount(person, readMeta(request));

  return noContent();
});
