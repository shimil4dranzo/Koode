import { createHmac } from 'node:crypto';
import { env } from '@/server/env';

/**
 * Phone numbers are the identity anchor, so getting this exactly right matters
 * more than almost anything else in the codebase: two spellings of one number
 * would create two people.
 *
 * Deliberately NOT using libphonenumber. It is ~500 KB and models the whole
 * world; Koode serves one town in Kerala and needs one country's rules. If the
 * platform ever expands beyond India, replace this module wholesale — it is
 * the only place that knows what a phone number looks like.
 */

/** Indian mobile numbers are 10 digits and begin with 6, 7, 8 or 9. */
const INDIA_MOBILE = /^[6-9]\d{9}$/;

export class InvalidPhoneError extends Error {
  constructor() {
    super('Invalid phone number');
    this.name = 'InvalidPhoneError';
  }
}

/**
 * Normalise user input to E.164 (`+919846012345`).
 *
 * Accepts every spelling people actually type: with or without `+91`, with a
 * leading `0`, and with spaces, hyphens or brackets anywhere.
 * Returns `null` rather than throwing so callers can produce a field-level
 * validation message.
 */
export function normalizePhone(input: string): string | null {
  if (typeof input !== 'string') return null;

  // Strip everything that is not a digit, keeping a leading + only as a hint.
  const digits = input.replace(/\D/g, '');
  if (digits.length === 0) return null;

  let national: string;

  if (digits.length === 10) {
    national = digits;
  } else if (digits.length === 11 && digits.startsWith('0')) {
    // Domestic trunk prefix: 09846012345
    national = digits.slice(1);
  } else if (digits.length === 12 && digits.startsWith('91')) {
    // 919846012345 or +91 9846012345
    national = digits.slice(2);
  } else if (digits.length === 13 && digits.startsWith('091')) {
    national = digits.slice(3);
  } else {
    return null;
  }

  if (!INDIA_MOBILE.test(national)) return null;

  return `+91${national}`;
}

/** Throwing variant, for call sites where the value was already validated. */
export function requirePhone(input: string): string {
  const phone = normalizePhone(input);
  if (!phone) throw new InvalidPhoneError();
  return phone;
}

export function isValidPhone(input: string): boolean {
  return normalizePhone(input) !== null;
}

/**
 * Mask a number for display to the person who owns it — "is this the right
 * number?" confirmations, and the claim screen. Never use this in a log.
 */
export function maskPhone(phone: string): string {
  const normalized = normalizePhone(phone);
  if (!normalized) return '•••••';
  return `+91 •••••• ${normalized.slice(-4)}`;
}

/**
 * A stable, non-reversible reference for logs and error reports.
 *
 * Section 6 forbids plaintext personal data in logs, but an operator still has
 * to be able to trace one user's failing request across several log lines.
 * A keyed hash prefix gives correlation without disclosure — and unlike
 * "last 4 digits", it discloses nothing at all.
 */
export function phoneLogRef(phone: string | null | undefined): string {
  if (!phone) return 'phone:none';
  const digest = createHmac('sha256', env.IP_HASH_SECRET).update(phone).digest('hex');
  return `phone:${digest.slice(0, 10)}`;
}

/**
 * Last-resort scrubber for strings that may embed a number — exception
 * messages, third-party SDK output, anything not written by us.
 */
export function redactPhonesInText(text: string): string {
  return text.replace(/(?:\+?91[-\s]?)?[6-9]\d{9}/g, '[redacted-phone]');
}
