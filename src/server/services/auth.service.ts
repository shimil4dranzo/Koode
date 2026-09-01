import { prisma } from '@/server/db/client';
import { generateOtpCode, hashIp, safeEqual, sha256 } from '@/server/crypto';
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

export type SignInOutcome =
  | { kind: 'signed_in'; personId: bigint; publicId: string }
  | { kind: 'needs_registration' }
  | { kind: 'needs_consent'; personId: bigint; publicId: string };

/**
 * Resolve a verified phone number to what should happen next.
 *
 * Three outcomes, because a phone number can be in three states:
 *  - no Person at all, or one that was anonymised → register
 *  - a Person who has not accepted the current consent version → re-consent
 *  - a Person ready to use the app → sign in
 *
 * A `pending_claim` person is a special case handled here rather than by the
 * caller: they exist only because somebody recommended them. Signing in with
 * that number is the strongest possible proof that they are who the referrer
 * said, so it is treated as claiming the profile.
 */
export async function resolveSignIn(phone: string): Promise<SignInOutcome> {
  const person = await prisma.person.findUnique({
    where: { phone },
    select: {
      id: true,
      publicId: true,
      status: true,
      anonymizedAt: true,
      consents: {
        where: { purpose: 'registration' },
        orderBy: { acceptedAt: 'desc' },
        take: 1,
        select: { consentVersion: true },
      },
    },
  });

  // An anonymised row keeps the phone column nulled, so this cannot match one.
  if (!person) return { kind: 'needs_registration' };

  if (person.status === 'suspended') {
    throw errors.forbidden('errors.accountSuspended');
  }

  const acceptedVersion = person.consents[0]?.consentVersion ?? null;
  if (needsReconsent(acceptedVersion)) {
    return { kind: 'needs_consent', personId: person.id, publicId: person.publicId };
  }

  return { kind: 'signed_in', personId: person.id, publicId: person.publicId };
}

export type RegisterInput = {
  phone: string;
  displayName: string;
  localityId: bigint | null;
  locale: string;
  consentVersion: string;
};

/**
 * Create a self-registered Person, or activate one that was waiting to be
 * claimed, and record consent in the same transaction.
 *
 * Consent and account creation must land together: an account with no consent
 * record is an account we cannot lawfully justify holding.
 */
export async function registerPerson(
  input: RegisterInput,
  meta: RequestMeta,
): Promise<{ personId: bigint; publicId: string }> {
  if (input.consentVersion !== CURRENT_CONSENT_VERSION) {
    throw errors.validation('errors.consentRequired');
  }

  const displayName = input.displayName.trim();
  if (displayName.length < 2) throw errors.validation('errors.validationFailed');

  return prisma.$transaction(async (tx) => {
    const existing = await tx.person.findUnique({
      where: { phone: input.phone },
      select: { id: true, publicId: true, status: true },
    });

    let personId: bigint;
    let publicId: string;
    let wasPendingClaim = false;

    if (existing) {
      if (existing.status === 'suspended') {
        throw errors.forbidden('errors.accountSuspended');
      }

      wasPendingClaim = existing.status === 'pending_claim';
      personId = existing.id;
      publicId = existing.publicId;

      await tx.person.update({
        where: { id: existing.id },
        data: {
          displayName,
          localityId: input.localityId,
          status: 'active',
          // Signing in with the number is the claim. Record when it happened.
          claimedAt: wasPendingClaim ? new Date() : undefined,
        },
      });
    } else {
      publicId = newPublicId();
      const created = await tx.person.create({
        data: {
          publicId,
          phone: input.phone,
          displayName,
          localityId: input.localityId,
          status: 'active',
          claimedAt: new Date(),
        },
        select: { id: true },
      });
      personId = created.id;
    }

    await tx.consentRecord.create({
      data: {
        personId,
        consentVersion: input.consentVersion,
        purpose: 'registration',
        locale: input.locale,
        ipHash: hashIp(meta.ip),
      },
    });

    // Any outstanding claim invitations are satisfied by this registration.
    if (wasPendingClaim) {
      await tx.claimInvitation.updateMany({
        where: { personId, status: 'pending' },
        data: { status: 'claimed', claimedAt: new Date() },
      });
    }

    await recordAudit(
      {
        action: existing ? AUDIT_ACTIONS.CONSENT_ACCEPTED : AUDIT_ACTIONS.PERSON_REGISTERED,
        actorPersonId: personId,
        entityType: 'person',
        entityId: publicId,
        metadata: {
          consentVersion: input.consentVersion,
          locale: input.locale,
          claimedPendingProfile: wasPendingClaim,
        },
        context: meta,
      },
      tx,
    );

    return { personId, publicId };
  });
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
