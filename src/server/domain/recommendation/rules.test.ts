import { describe, expect, it } from 'vitest';
import {
  MAX_NOTE_LENGTH,
  MIN_NOTE_LENGTH,
  assertCanCreateRecommendation,
  assertCanWithdraw,
  assertValidNote,
  isDisplayable,
  type RecommendationAttempt,
} from '@/server/domain/recommendation/rules';

const REFERRER_ID = 1n;
const SUBJECT_ID = 2n;

const attempt = (overrides: Partial<RecommendationAttempt> = {}): RecommendationAttempt => ({
  referrerId: REFERRER_ID,
  referrer: { status: 'active', anonymizedAt: null },
  subject: { id: SUBJECT_ID, status: 'active', anonymizedAt: null },
  existing: null,
  isBlocked: false,
  ...overrides,
});

describe('the invariants on the central entity', () => {
  it('allows a straightforward recommendation', () => {
    expect(() => assertCanCreateRecommendation(attempt())).not.toThrow();
  });

  it('refuses self-recommendation', () => {
    // The value of a vouch is that somebody ELSE staked their name on it.
    // Allowing this would make the whole graph worthless.
    expect(() =>
      assertCanCreateRecommendation(
        attempt({ subject: { id: REFERRER_ID, status: 'active', anonymizedAt: null } }),
      ),
    ).toThrow(/createdSelfError/);
  });

  it('refuses a second ACTIVE recommendation for the same pair', () => {
    expect(() =>
      assertCanCreateRecommendation(attempt({ existing: { status: 'active' } })),
    ).toThrow(/duplicateError/);
  });

  it('allows a new recommendation after the previous one was withdrawn', () => {
    // Notes are immutable, so withdraw-and-rewrite is the correction path.
    // Blocking it would leave a referrer permanently stuck with wording they
    // regret.
    expect(() =>
      assertCanCreateRecommendation(attempt({ existing: { status: 'withdrawn' } })),
    ).not.toThrow();
  });

  it("honours the subject's block ahead of every other rule", () => {
    // A person who rejected a profile must never be re-added by the same
    // referrer, and the message must say so rather than leaking a different
    // reason.
    expect(() => assertCanCreateRecommendation(attempt({ isBlocked: true }))).toThrow(
      /blockedError/,
    );
  });

  it('reports a block rather than a duplicate when both apply', () => {
    expect(() =>
      assertCanCreateRecommendation(
        attempt({ isBlocked: true, existing: { status: 'active' } }),
      ),
    ).toThrow(/blockedError/);
  });

  it('refuses a referrer who is not entitled to recommend', () => {
    for (const status of ['pending_claim', 'suspended'] as const) {
      expect(() =>
        assertCanCreateRecommendation(
          attempt({ referrer: { status, anonymizedAt: null } }),
        ),
        status,
      ).toThrow(/notVerifiedError/);
    }
  });

  it('ALLOWS recommending a pending_claim subject', () => {
    // This is the whole point of the claim flow: a referrer puts forward
    // somebody who is not on Koode yet, and that person then decides.
    expect(() =>
      assertCanCreateRecommendation(
        attempt({ subject: { id: SUBJECT_ID, status: 'pending_claim', anonymizedAt: null } }),
      ),
    ).not.toThrow();
  });

  it('refuses a suspended or anonymised subject', () => {
    expect(() =>
      assertCanCreateRecommendation(
        attempt({ subject: { id: SUBJECT_ID, status: 'suspended', anonymizedAt: null } }),
      ),
    ).toThrow();

    expect(() =>
      assertCanCreateRecommendation(
        attempt({ subject: { id: SUBJECT_ID, status: 'active', anonymizedAt: new Date() } }),
      ),
    ).toThrow();
  });
});

describe('withdrawal', () => {
  it('lets the author withdraw their own recommendation', () => {
    expect(() =>
      assertCanWithdraw({ referrerPersonId: REFERRER_ID, status: 'active' }, REFERRER_ID),
    ).not.toThrow();
  });

  it('refuses anybody else, including the subject', () => {
    // The subject's remedies are rejecting the claim or reporting it. Letting
    // them delete an attributed statement would break the record in the other
    // direction.
    expect(() =>
      assertCanWithdraw({ referrerPersonId: REFERRER_ID, status: 'active' }, SUBJECT_ID),
    ).toThrow();
  });

  it('refuses withdrawing something already withdrawn', () => {
    expect(() =>
      assertCanWithdraw({ referrerPersonId: REFERRER_ID, status: 'withdrawn' }, REFERRER_ID),
    ).toThrow();
  });
});

describe('display', () => {
  it('shows only active, unhidden recommendations', () => {
    expect(isDisplayable({ status: 'active', hiddenAt: null })).toBe(true);
    expect(isDisplayable({ status: 'withdrawn', hiddenAt: null })).toBe(false);
    expect(isDisplayable({ status: 'active', hiddenAt: new Date() })).toBe(false);
  });
});

describe('note validation', () => {
  it('rejects a note that is too short to be a vouch', () => {
    expect(() => assertValidNote('good')).toThrow();
    expect(() => assertValidNote('   ')).toThrow();
  });

  it('accepts a note at the boundaries', () => {
    expect(() => assertValidNote('a'.repeat(MIN_NOTE_LENGTH))).not.toThrow();
    expect(() => assertValidNote('a'.repeat(MAX_NOTE_LENGTH))).not.toThrow();
  });

  it('rejects a note beyond the maximum', () => {
    expect(() => assertValidNote('a'.repeat(MAX_NOTE_LENGTH + 1))).toThrow();
  });

  it('counts a Malayalam note by characters, not bytes', () => {
    // A Malayalam sentence is three bytes per character in UTF-8. Validating
    // on byte length would reject notes that are perfectly reasonable.
    expect(() => assertValidNote('നല്ല പണിക്കാരൻ ആണ്')).not.toThrow();
  });
});
