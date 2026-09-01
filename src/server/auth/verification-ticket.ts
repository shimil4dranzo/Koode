import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { env } from '@/server/env';
import { errors } from '@/server/errors';

/**
 * Proof that a phone number was verified moments ago.
 *
 * Registration is two steps — verify the code, then give a name and accept the
 * consent text — but a one-time password may only be used once. Asking for the
 * code again on the second step would mean either leaving it un-consumed
 * (so it could be replayed) or sending a second SMS (which costs money and
 * loses users).
 *
 * So verification issues a short-lived, signed, httpOnly ticket instead. It is
 * not a session: it authorises exactly one thing, creating or re-consenting an
 * account for the phone number named inside it, and it expires in ten minutes.
 */

const TICKET_COOKIE = 'koode_verified';
const TICKET_TTL_MS = 10 * 60 * 1000;

/** `<phone>.<expiresAtMs>.<hmac>` — signed, not encrypted. */
function sign(payload: string): string {
  return createHmac('sha256', env.SESSION_SECRET)
    .update(`verification-ticket:${payload}`)
    .digest('base64url');
}

export async function issueVerificationTicket(phone: string): Promise<void> {
  const expiresAt = Date.now() + TICKET_TTL_MS;
  const payload = `${phone}.${expiresAt}`;
  const cookieStore = await cookies();

  cookieStore.set(TICKET_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(TICKET_TTL_MS / 1000),
  });
}

/**
 * Read and validate the ticket, returning the verified phone number.
 *
 * Throws rather than returning null: every caller treats a missing or expired
 * ticket as "start again", and making that explicit stops a handler
 * accidentally continuing with an unverified number.
 */
export async function requireVerifiedPhone(): Promise<string> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(TICKET_COOKIE)?.value;
  if (!raw) throw errors.unauthenticated('errors.expiredOtp');

  // The phone number itself contains no dots, so splitting from the right is
  // unambiguous.
  const parts = raw.split('.');
  if (parts.length !== 3) throw errors.unauthenticated('errors.expiredOtp');

  const [phone, expiresAtRaw, signature] = parts as [string, string, string];
  const payload = `${phone}.${expiresAtRaw}`;

  const expected = Buffer.from(sign(payload));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    throw errors.unauthenticated('errors.expiredOtp');
  }

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw errors.unauthenticated('errors.expiredOtp');
  }

  return phone;
}

/** Consume the ticket. Always called once registration or re-consent succeeds. */
export async function clearVerificationTicket(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(TICKET_COOKIE);
}
