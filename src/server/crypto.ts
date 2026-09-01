import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';
import { env } from '@/server/env';

/**
 * Small, boring crypto helpers, all standard library.
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

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

/** promisify() loses scrypt's options overload, so the wrapper is manual. */
function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (error, derived) =>
      error ? reject(error) : resolve(derived),
    );
  });
}

/**
 * scrypt via node's own crypto — memory-hard, standardised, and zero new
 * dependencies, which on a grant-funded multi-year project beats a native
 * argon2 binding that must survive every Node upgrade. Parameters are encoded
 * into the stored string so they can be raised later without invalidating
 * existing hashes.
 */
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 128 * SCRYPT_N * SCRYPT_R * 2,
  });

  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join(':');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts as [
    string, string, string, string, string, string,
  ];
  const N = Number(nRaw);
  const r = Number(rRaw);
  const pFactor = Number(pRaw);
  if (![N, r, pFactor].every((v) => Number.isInteger(v) && v > 0)) return false;

  const expected = Buffer.from(hashB64, 'base64');
  const derived = await scryptAsync(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N,
    r,
    p: pFactor,
    maxmem: 128 * N * r * 2,
  });

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
