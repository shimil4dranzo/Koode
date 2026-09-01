import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { prisma } from '@/server/db/client';
import { generateToken, hashIp, hashToken } from '@/server/crypto';
import { env } from '@/server/env';
import type { PlatformRole, PersonStatus } from '@/server/domain/constants';
import { errors } from '@/server/errors';

/**
 * Session handling.
 *
 * The cookie holds an opaque random secret; the database stores only its hash.
 * A database leak therefore does not hand over live sessions, and there is no
 * signed-token format to get wrong.
 *
 * Ninety days is deliberately long. There is no password to fall back on — a
 * expired session means another SMS, which costs money and, more importantly,
 * loses the user. The session is revocable server-side, which is the control
 * that actually matters.
 */

export const SESSION_COOKIE = 'koode_session';
const SESSION_TTL_DAYS = 90;
/** Refresh `lastSeenAt` at most this often, to avoid a write on every request. */
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

/**
 * The signed-in person, as the rest of the app is allowed to see them.
 *
 * There is no `phone` field here, and that is the point: this object is passed
 * into Server Components and can end up serialised into the page. The number
 * is reachable only through the audited reveal path.
 */
export type CurrentPerson = {
  id: bigint;
  publicId: string;
  displayName: string;
  status: PersonStatus;
  platformRole: PlatformRole;
  localityId: bigint | null;
  hasVerifiedMembership: boolean;
  /**
   * Always null, and present only so that a `CurrentPerson` satisfies
   * `PersonFacts` and can be passed straight to the domain rules.
   *
   * `getCurrentPerson` returns null for an anonymised account, so a value of
   * this type is by construction never anonymised. Keeping the field rather
   * than casting at each call site means the domain rules stay the single
   * authority on what an anonymised person may do.
   */
  anonymizedAt: null;
};

export type RequestMeta = { ip: string | null; userAgent: string | null };

/** Best-effort client IP, honouring the proxy header the deployment sets. */
export async function getRequestMeta(): Promise<RequestMeta> {
  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() ?? headerList.get('x-real-ip') ?? null;

  return { ip, userAgent: headerList.get('user-agent') };
}

/**
 * Read the current session.
 *
 * Wrapped in React's `cache` so that a page rendering a header, a nav and a
 * body all asking "who is signed in?" makes one query per request, not three.
 */
export const getCurrentPerson = cache(async (): Promise<CurrentPerson | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      lastSeenAt: true,
      person: {
        select: {
          id: true,
          publicId: true,
          displayName: true,
          status: true,
          platformRole: true,
          localityId: true,
          anonymizedAt: true,
          anchorMemberships: {
            where: { status: 'verified' },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt <= new Date()) return null;

  const { person } = session;
  // A suspended or anonymised account keeps its session rows but must not act.
  if (person.anonymizedAt) return null;
  if (person.status === 'suspended') return null;

  // Sliding activity timestamp, written at most hourly.
  if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    void prisma.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch(() => {
        // A failed liveness touch must never break the request.
      });
  }

  return {
    id: person.id,
    publicId: person.publicId,
    displayName: person.displayName,
    status: person.status as PersonStatus,
    platformRole: person.platformRole as PlatformRole,
    localityId: person.localityId,
    hasVerifiedMembership: person.anchorMemberships.length > 0,
    anonymizedAt: null,
  };
});

/** Throwing variant for anything behind a sign-in. */
export async function requirePerson(): Promise<CurrentPerson> {
  const person = await getCurrentPerson();
  if (!person) throw errors.unauthenticated();
  return person;
}

export async function requireRole(...allowed: PlatformRole[]): Promise<CurrentPerson> {
  const person = await requirePerson();
  if (!allowed.includes(person.platformRole)) throw errors.forbidden();
  return person;
}

/** Issue a session and set the cookie. Called only after OTP verification. */
export async function createSession(
  personId: bigint,
  meta: RequestMeta,
): Promise<void> {
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      personId,
      tokenHash: hashToken(token),
      expiresAt,
      ipHash: hashIp(meta.ip),
      userAgent: meta.userAgent?.slice(0, 255) ?? null,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    // Lax rather than Strict: the claim link arrives by SMS and is followed
    // from another app, and Strict would drop the session on that navigation.
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

/** Revoke the current session server-side and clear the cookie. */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    await prisma.session
      .updateMany({
        where: { tokenHash: hashToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => {
        // Clearing the cookie matters more than recording the revocation.
      });
  }

  cookieStore.delete(SESSION_COOKIE);
}

/** Used when a person is suspended or deletes their account. */
export async function revokeAllSessions(personId: bigint): Promise<void> {
  await prisma.session.updateMany({
    where: { personId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
