import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import { env } from '@/server/env';

/**
 * Small, boring crypto helpers. Everything here is standard library — there is
 * no password in this system, so there is no password hash and no bcrypt.
 */

/** URL-safe opaque secret, for session cookies and claim links. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Hash a bearer secret for storage.
 *
 * SHA-256 keyed with the session secret is correct here — unlike a password,
 * these tokens are 256 bits of machine-generated entropy, so there is nothing
 * for an attacker to brute-force and no reason to pay a slow KDF on every
 * request. Keying it means a leaked database alone does not let an attacker
 * pre-compute matches.
 */
export function hashToken(token: string): string {
  return createHmac('sha256', env.SESSION_SECRET).update(token).digest('hex');
}

/**
 * Hash an IP address for the audit log.
 *
 * Uses its own secret so that audit records cannot be correlated back to raw
 * addresses, and so that rotating session keys does not invalidate audit
 * history. The output is truncated to 32 hex characters: still far beyond
 * collision range at this scale, and a smaller footprint of derived personal
 * data at rest.
 */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHmac('sha256', env.IP_HASH_SECRET).update(ip).digest('hex').slice(0, 32);
}

/** Unkeyed digest, for non-secret fingerprints. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * A numeric one-time password.
 *
 * `randomInt` is cryptographically secure and, unlike `Math.random`, unbiased
 * across the range. Leading zeros are preserved by padding, so every code is
 * exactly `digits` long — users read these aloud over the phone.
 */
export function generateOtpCode(digits = 6): string {
  const max = 10 ** digits;
  return String(randomInt(0, max)).padStart(digits, '0');
}

/** Constant-time comparison of two hex digests of equal length. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
