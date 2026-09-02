import type { AccountType } from '@/server/domain/constants';
import { prisma } from '@/server/db/client';
import { env } from '@/server/env';
import {
  generateOtpCode,
  hashIp,
  hashPassword,
  safeEqual,
  sha256,
  verifyPassword,
} from '@/server/crypto';
import { errors } from '@/server/errors';
import { maskPhone, phoneLogRef } from '@/server/phone';
import { enforceRateLimit, resetRateLimit } from '@/server/ratelimit';
import { getSmsSender } from '@/server/sms';
import { AUDIT_ACTIONS, recordAudit, recordAuditSafely } from '@/server/audit';
import { newPublicId } from '@/server/ids';
import { CURRENT_CONSENT_VERSION, needsReconsent } from '@/server/consent/versions';
import type { OtpPurpose } from '@/server/domain/constants';
import type { RequestMeta } from '@/server/auth/session';

/**
 * One-time password issue and verification.
 *
 * There is no password in this system, so this is the entire authentication
 * surface and every rule here is load-bearing.
 *
 * Design notes:
 *  - Challenges live in MySQL, not Redis. A Redis restart must not lock every
 *    user out mid-login; the rate limiter can fail open, authentication cannot.
 *  - Only a hash of the code is stored, so a database leak does not hand over
 *    live codes.
 *  - Sending is rate-limited per phone AND per IP: per phone stops one number
 *    being spammed, per IP stops one attacker walking a range of numbers.
 */

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_DIGITS = 6;

/** The rate-limit key for a phone. Never the number itself — Redis is not a place for PII. */
function phoneKey(phone: string): string {
  return sha256(phone).slice(0, 32);
}

export type SendOtpResult = {
  /** Masked, for the "we sent a code to …" line. Never the full number. */
  maskedPhone: string;
  expiresInSeconds: number;
  /**
   * The code itself — DEVELOPMENT ONLY.
   *
   * With the console SMS provider nothing is actually delivered; the code
   * lands in a server log the person testing the app is usually not watching,
   * which reads as "OTP is broken". So a development build hands the code to
   * the UI and the sign-in screen shows it.
   *
   * Two locks, either sufficient alone: NODE_ENV must be exactly
   * 'development', and the provider must be the console stub — and env.ts
   * refuses to boot production with the console provider at all.
   */
  devCode?: string;
};

/**
 * Issue a one-time password.
 *
 * Deliberately does NOT reveal whether the number is already registered.
 * Returning "no such account" here would turn this endpoint into a way to test
 * whether a given person is on Koode, which is exactly the enumeration the
 * privacy model forbids. Registration and sign-in are the same flow.
 */
export async function sendOtp(
  phone: string,
  purpose: OtpPurpose,
  meta: RequestMeta,
): Promise<SendOtpResult> {
  const subject = phoneKey(phone);

  await enforceRateLimit('otpSend', subject);
  if (meta.ip) await enforceRateLimit('anonymousWrite', hashIp(meta.ip) ?? 'unknown');

  const code = generateOtpCode(OTP_DIGITS);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  // Invalidate any outstanding challenge for this phone and purpose, so an
  // older code cannot still be used once a new one has been requested.
  await prisma.$transaction(async (tx) => {
    await tx.otpChallenge.updateMany({
      where: { phone, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    await tx.otpChallenge.create({
      data: { phone, purpose, codeHash: sha256(code), expiresAt },
    });

    await recordAudit(
      {
        action: AUDIT_ACTIONS.OTP_SENT,
        entityType: 'otp',
        metadata: { purpose },
        context: meta,
      },
      tx,
    );
  });

  await getSmsSender().send({
    to: phone,
    kind: purpose === 'claim' ? 'claim_invitation' : 'otp',
    // English-only by design: this is a machine-readable code, and an SMS
    // gateway charging per segment sends Malayalam as expensive UCS-2.
    body: `${code} is your Koode verification code. It expires in 5 minutes. Do not share it with anyone.`,
  });

  return {
    maskedPhone: maskPhone(phone),
    expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
    ...(env.NODE_ENV === 'development' && env.SMS_PROVIDER === 'console'
      ? { devCode: code }
      : {}),
  };
}

/**
 * Check a submitted code and consume it.
 *
 * Returns nothing useful on success beyond "this phone is verified" — creating
 * or finding the Person is the caller's job, because sign-in and claim do
 * different things with the same verified fact.
 */
export async function verifyOtp(
  phone: string,
  code: string,
  purpose: OtpPurpose,
  meta: RequestMeta,
): Promise<void> {
  const subject = phoneKey(phone);
  await enforceRateLimit('otpVerify', subject);

  const challenge = await prisma.otpChallenge.findFirst({
    where: { phone, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  /**
   * Records the failure and returns the error to throw.
   *
   * Returning rather than throwing keeps `throw await rejected(...)` at each
   * call site, which lets TypeScript narrow `challenge` afterwards — a helper
   * that throws internally does not.
   */
  const rejected = async (messageKey: string) => {
    await recordAuditSafely({
      action: AUDIT_ACTIONS.OTP_FAILED,
      entityType: 'otp',
      metadata: { purpose, reason: messageKey },
      context: meta,
    });
    return errors.validation(messageKey);
  };

  if (!challenge) throw await rejected('errors.invalidOtp');
  if (challenge.expiresAt <= new Date()) throw await rejected('errors.expiredOtp');

  if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
    // Burn the challenge so an attacker cannot keep guessing against it after
    // the per-phone rate-limit window rolls over.
    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });
    throw await rejected('errors.otpAttemptsExceeded');
  }

  if (!safeEqual(sha256(code), challenge.codeHash)) {
    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    throw await rejected('errors.invalidOtp');
  }

  await prisma.otpChallenge.update({
    where: { id: challenge.id },
    data: { consumedAt: new Date() },
  });

  // A correct code clears the guess counter so a user who fat-fingered twice
  // is not locked out of their next legitimate attempt.
  await resetRateLimit('otpVerify', subject);

  await recordAuditSafely({
    action: AUDIT_ACTIONS.OTP_VERIFIED,
    entityType: 'otp',
    metadata: { purpose },
    context: meta,
  });
}

export type EmailAuthOutcome =
  | { kind: 'signed_in'; personId: bigint; publicId: string }
  | { kind: 'needs_consent'; personId: bigint; publicId: string };

/**
 * Create an account with e-mail and password.
 *
 * The owner's 2026-09-01 decision replaced phone-first identity with
 * accounts (e-mail+password or Google); the phone number survives as an
 * optional, currently unverified contact field captured when somebody first
 * posts work. Consequences are recorded in ARCHITECTURE.md — including that
 * there is no password reset until an e-mail provider exists.
 *
 * Consent is recorded in the same transaction as the account: an account with
 * no consent record is one we cannot lawfully justify holding.
 */
export async function registerWithPassword(
  input: {
    email: string;
    password: string;
    displayName: string;
    localityId: bigint | null;
    accountType?: AccountType | undefined;
    locale: string;
    consentVersion: string;
  },
  meta: RequestMeta,
): Promise<{ personId: bigint; publicId: string }> {
  if (input.consentVersion !== CURRENT_CONSENT_VERSION) {
    throw errors.validation('errors.consentRequired');
  }

  const email = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);
  const publicId = newPublicId();

  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.person.create({
        data: {
          publicId,
          email,
          passwordHash,
          displayName: input.displayName.trim(),
          localityId: input.localityId,
          accountType: input.accountType ?? 'seeker',
          status: 'active',
          claimedAt: new Date(),
        },
        select: { id: true },
      });

      await tx.consentRecord.create({
        data: {
          personId: created.id,
          consentVersion: input.consentVersion,
          purpose: 'registration',
          locale: input.locale,
          ipHash: hashIp(meta.ip),
        },
      });

      await recordAudit(
        {
          action: AUDIT_ACTIONS.PERSON_REGISTERED,
          actorPersonId: created.id,
          entityType: 'person',
          entityId: publicId,
          metadata: { method: 'password', locale: input.locale },
          context: meta,
        },
        tx,
      );

      return { personId: created.id, publicId };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw errors.conflict('errors.emailTaken');
    throw error;
  }
}

/**
 * E-mail + password sign-in.
 *
 * One failure message for "no such account" and "wrong password", and the
 * hash is verified even when the account does not exist — otherwise response
 * timing and wording would let anyone test which e-mails are registered.
 */
export async function loginWithPassword(
  emailRaw: string,
  password: string,
  meta: RequestMeta,
): Promise<EmailAuthOutcome> {
  const email = emailRaw.trim().toLowerCase();
  await enforceRateLimit('passwordLogin', sha256(email).slice(0, 32));
  if (meta.ip) await enforceRateLimit('anonymousWrite', hashIp(meta.ip) ?? 'unknown');

  const person = await prisma.person.findUnique({
    where: { email },
    select: {
      id: true,
      publicId: true,
      status: true,
      anonymizedAt: true,
      passwordHash: true,
      consents: {
        where: { purpose: 'registration' },
        orderBy: { acceptedAt: 'desc' },
        take: 1,
        select: { consentVersion: true },
      },
    },
  });

  const storedHash =
    person?.passwordHash ??
    // A constant, valid-format hash of nothing in particular, so the compare
    // below costs the same whether or not the account exists.
    'scrypt:32768:8:1:AAAAAAAAAAAAAAAAAAAAAA==:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

  const passwordOk = await verifyPassword(password, storedHash);

  if (!person || !person.passwordHash || !passwordOk || person.anonymizedAt) {
    await recordAuditSafely({
      action: AUDIT_ACTIONS.OTP_FAILED,
      entityType: 'person',
      metadata: { method: 'password' },
      context: meta,
    });
    throw errors.validation('errors.invalidCredentials');
  }

  if (person.status !== 'active') throw errors.forbidden('errors.accountSuspended');

  const acceptedVersion = person.consents[0]?.consentVersion ?? null;
  if (needsReconsent(acceptedVersion)) {
    return { kind: 'needs_consent', personId: person.id, publicId: person.publicId };
  }

  return { kind: 'signed_in', personId: person.id, publicId: person.publicId };
}

/** Prisma unique-constraint violation, without importing the error class here. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

/** Record acceptance of a new consent version by an existing person. */
export async function acceptConsent(
  personId: bigint,
  publicId: string,
  locale: string,
  meta: RequestMeta,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.consentRecord.create({
      data: {
        personId,
        consentVersion: CURRENT_CONSENT_VERSION,
        purpose: 'registration',
        locale,
        ipHash: hashIp(meta.ip),
      },
    });

    await recordAudit(
      {
        action: AUDIT_ACTIONS.CONSENT_ACCEPTED,
        actorPersonId: personId,
        entityType: 'person',
        entityId: publicId,
        metadata: { consentVersion: CURRENT_CONSENT_VERSION, locale },
        context: meta,
      },
      tx,
    );
  });
}

/**
 * Delete expired and consumed challenges.
 *
 * Called from the maintenance endpoint rather than on every verify, so a
 * user-facing request never pays for housekeeping.
 */
export async function purgeExpiredOtpChallenges(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const { count } = await prisma.otpChallenge.deleteMany({
    where: { OR: [{ expiresAt: { lt: cutoff } }, { consumedAt: { lt: cutoff } }] },
  });

  if (count > 0) console.warn(`[auth] purged ${count} expired OTP challenge(s)`);
  return count;
}

/** Exported for the log line in the console SMS stub during development. */
export const debugPhoneRef = phoneLogRef;
