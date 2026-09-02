import type { NextRequest } from 'next/server';
import { created, handler } from '@/server/http/respond';
import { readJson, readMeta } from '@/server/http/request';
import { registerGoogleSchema } from '@/server/http/schemas';
import { GOOGLE_SIGNUP_COOKIE, readSignupTicket } from '@/server/auth/google';
import { createSession } from '@/server/auth/session';
import { resolveLocalityId } from '@/server/services/locality.service';
import { prisma } from '@/server/db/client';
import { newPublicId } from '@/server/ids';
import { hashIp } from '@/server/crypto';
import { AUDIT_ACTIONS, recordAudit } from '@/server/audit';
import { CURRENT_CONSENT_VERSION } from '@/server/consent/versions';
import { errors } from '@/server/errors';

/**
 * POST /api/auth/register-google — mint the account a sign-up ticket promised.
 *
 * The Google identity comes exclusively from the signed httpOnly ticket the
 * callback set, never from the request body — the client only supplies what
 * Google could not: the name the person wants shown, a locality, and the
 * consent acceptance this whole detour exists to collect.
 */
export const POST = handler(async (request: NextRequest) => {
  const identity = readSignupTicket(request.cookies.get(GOOGLE_SIGNUP_COOKIE)?.value);
  if (!identity) throw errors.unauthenticated('auth.googleFailed');

  const body = await readJson(request, registerGoogleSchema);
  if (body.consentVersion !== CURRENT_CONSENT_VERSION) {
    throw errors.validation('errors.consentRequired');
  }

  const meta = readMeta(request);
  const localityId = body.localityPublicId
    ? await resolveLocalityId(body.localityPublicId)
    : null;
  const publicId = newPublicId();

  const person = await prisma.$transaction(async (tx) => {
    // The ticket may be minutes old; someone may have registered this address
    // or Google account in between. Attach rather than duplicate.
    const existing = await tx.person.findFirst({
      where: { OR: [{ googleSub: identity.sub }, { email: identity.email }] },
      select: { id: true, publicId: true, status: true, anonymizedAt: true },
    });

    if (existing) {
      if (existing.anonymizedAt || existing.status !== 'active') {
        throw errors.forbidden('errors.accountSuspended');
      }
      await tx.person.update({
        where: { id: existing.id },
        data: { googleSub: identity.sub },
      });
      return existing;
    }

    const createdPerson = await tx.person.create({
      data: {
        publicId,
        googleSub: identity.sub,
        accountType: body.accountType ?? 'seeker',
        email: identity.email,
        displayName: body.displayName.trim(),
        localityId,
        status: 'active',
        claimedAt: new Date(),
      },
      select: { id: true, publicId: true },
    });

    await tx.consentRecord.create({
      data: {
        personId: createdPerson.id,
        consentVersion: body.consentVersion,
        purpose: 'registration',
        locale: body.locale,
        ipHash: hashIp(meta.ip),
      },
    });

    await recordAudit(
      {
        action: AUDIT_ACTIONS.PERSON_REGISTERED,
        actorPersonId: createdPerson.id,
        entityType: 'person',
        entityId: createdPerson.publicId,
        metadata: { method: 'google', locale: body.locale },
        context: meta,
      },
      tx,
    );

    return createdPerson;
  });

  await createSession(person.id, meta);

  const response = created({ status: 'signed_in', person: { publicId: person.publicId } });
  response.cookies.delete(GOOGLE_SIGNUP_COOKIE);
  return response;
});
