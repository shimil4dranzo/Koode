import { errors } from '@/server/errors';
import { canRecommend, type PersonFacts } from '@/server/domain/person/rules';
import type { RecommendationStatus } from '@/server/domain/constants';

/**
 * The rules governing the central entity in Koode.
 *
 * A recommendation is a named person putting their word behind another, on the
 * record. Everything here protects one of two things: the integrity of that
 * record, or the rights of the person being written about.
 *
 * Pure functions, no I/O. The service supplies the facts; these decide.
 */

export type ReferrerFacts = PersonFacts;

export type SubjectFacts = {
  /** Internal id, for the self-recommendation check. */
  id: bigint;
  status: PersonFacts['status'];
  anonymizedAt: Date | null;
};

export type ExistingRecommendation = {
  status: RecommendationStatus;
};

export type RecommendationAttempt = {
  referrerId: bigint;
  referrer: ReferrerFacts;
  subject: SubjectFacts;
  /** Any recommendation this referrer has already written about this subject. */
  existing: ExistingRecommendation | null;
  /** True when the subject has previously rejected a profile from this referrer. */
  isBlocked: boolean;
};

/**
 * Every guard that must pass before a recommendation may be written.
 *
 * Order matters for the message the user sees: the most specific and most
 * actionable failure is checked first.
 */
export function assertCanCreateRecommendation(attempt: RecommendationAttempt): void {
  // 1. A referrer may not recommend themselves.
  //
  // Self-vouching would make the entire graph worthless: the value of a
  // recommendation is that somebody *else* staked their name on it.
  if (attempt.referrerId === attempt.subject.id) {
    throw errors.invariant('recommendations.createdSelfError');
  }

  // 2. The referrer must be entitled to recommend.
  if (!canRecommend(attempt.referrer)) {
    throw errors.forbidden('recommendations.notVerifiedError');
  }

  // 3. The subject's veto wins over everything.
  //
  // Checked before the duplicate rule so that somebody who rejected a profile
  // is told they are blocked, rather than being quietly treated as a
  // duplicate — and so a referrer cannot use the difference in error messages
  // to work out that the subject rejected them.
  if (attempt.isBlocked) {
    throw errors.forbidden('recommendations.blockedError');
  }

  // 4. One ACTIVE recommendation per (referrer, subject) pair.
  //
  // A withdrawn one does not block a new one — that is the correction path,
  // since notes are immutable. The database enforces this too, via the
  // nullable mirrored key on `recommendation`; this check exists so the user
  // gets a comprehensible message rather than a constraint violation.
  if (attempt.existing?.status === 'active') {
    throw errors.conflict('recommendations.duplicateError');
  }

  // 5. A suspended subject cannot be vouched for.
  //
  // `pending_claim` is deliberately allowed: recommending somebody who is not
  // yet on Koode is the entire point of the claim flow.
  if (attempt.subject.status === 'suspended' || attempt.subject.anonymizedAt !== null) {
    throw errors.forbidden('errors.notAllowed');
  }
}

/**
 * May this person withdraw this recommendation?
 *
 * Only its author. A subject who objects has other remedies — rejecting the
 * claim, or reporting it — but silently deleting somebody else's attributed
 * statement would make the record untrustworthy in the other direction.
 */
export function assertCanWithdraw(
  recommendation: { referrerPersonId: bigint; status: RecommendationStatus },
  actorId: bigint,
): void {
  if (recommendation.referrerPersonId !== actorId) {
    throw errors.forbidden();
  }
  if (recommendation.status !== 'active') {
    throw errors.conflict('errors.validationFailed');
  }
}

/**
 * Is this recommendation shown on the subject's public profile?
 *
 * A withdrawn or moderator-hidden recommendation is retained — the record that
 * it existed is part of the audit trail — but is not displayed.
 */
export function isDisplayable(recommendation: {
  status: RecommendationStatus;
  hiddenAt: Date | null;
}): boolean {
  return recommendation.status === 'active' && recommendation.hiddenAt === null;
}

/**
 * Notes are immutable.
 *
 * There is no update path in the service layer, and this function exists to
 * say so at the point where somebody would look for one. Correcting a
 * recommendation means withdrawing it and writing a new one, so the history
 * shows that a change of opinion happened rather than silently rewriting what
 * was said.
 */
export const NOTE_IS_IMMUTABLE = true;

/** Minimum length for a note. A vouch of two words is not a vouch. */
export const MIN_NOTE_LENGTH = 10;
export const MAX_NOTE_LENGTH = 2000;

export function assertValidNote(note: string): void {
  const trimmed = note.trim();
  if (trimmed.length < MIN_NOTE_LENGTH || trimmed.length > MAX_NOTE_LENGTH) {
    throw errors.validation('errors.validationFailed');
  }
}
