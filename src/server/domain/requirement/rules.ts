import type { RequirementStatus } from '@/server/domain/constants';
import { errors } from '@/server/errors';

/**
 * Requirement lifecycle rules — pure, no I/O.
 *
 *   open ──> filled     employer found someone (needs a recorded engagement)
 *        ──> closed     employer withdrew it
 *        ──> expired    the clock ran out
 *
 * `filled`, `closed` and `expired` are terminal. Re-opening is deliberately
 * not supported: a requirement that comes back is a new requirement, and
 * conflating the two would make the engagement history ambiguous.
 */

const ALLOWED_TRANSITIONS: Record<RequirementStatus, readonly RequirementStatus[]> = {
  open: ['filled', 'closed', 'expired'],
  filled: [],
  closed: [],
  expired: [],
};

export type RequirementFacts = {
  status: RequirementStatus;
  expiresAt: Date;
  hiddenAt: Date | null;
  /** How many engagements have been recorded against this requirement. */
  engagementCount: number;
};

export function isTransitionAllowed(
  from: RequirementStatus,
  to: RequirementStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * The invariant from Section 5, enforced here rather than in the route:
 * a requirement cannot become `filled` without at least one recorded
 * Engagement.
 *
 * This is what makes the outcome data trustworthy. Without it, "filled" would
 * accumulate as a meaningless flag and Stage 2 would have nothing real to
 * compute referrer credibility from.
 */
export function assertCanTransition(
  facts: RequirementFacts,
  to: RequirementStatus,
): void {
  if (!isTransitionAllowed(facts.status, to)) {
    throw errors.invariant('errors.validationFailed', {
      from: facts.status,
      to,
    });
  }

  if (to === 'filled' && facts.engagementCount < 1) {
    throw errors.invariant('engagement.needEngagementError');
  }
}

/** Is this requirement visible to the public right now? */
export function isPubliclyListed(facts: RequirementFacts, now: Date = new Date()): boolean {
  if (facts.hiddenAt !== null) return false;
  if (facts.status !== 'open') return false;
  // A row whose clock has run out but which the sweeper has not yet marked
  // `expired` must already be invisible; otherwise expiry would depend on a
  // background job having run.
  return facts.expiresAt > now;
}

/**
 * May somebody express interest?
 *
 * Same answer as visibility today. Separate because the questions are
 * separate: a requirement could later be listed for reference while closed to
 * new interest.
 */
export function acceptsInterest(facts: RequirementFacts, now: Date = new Date()): boolean {
  return isPubliclyListed(facts, now);
}

/** May the employer still edit the text? */
export function isEditable(facts: RequirementFacts): boolean {
  return facts.status === 'open';
}

/**
 * Default life of a posting.
 *
 * PRODUCT DECISION, PENDING CONFIRMATION (ARCHITECTURE.md §Open decisions).
 * Thirty days matches the unclaimed-profile window, which keeps one number in
 * a user's head instead of two. The employer can extend.
 */
export const REQUIREMENT_TTL_DAYS = 30;

export function defaultExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + REQUIREMENT_TTL_DAYS * 24 * 60 * 60 * 1000);
}
