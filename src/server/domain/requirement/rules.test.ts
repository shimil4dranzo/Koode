import { describe, expect, it } from 'vitest';
import {
  acceptsInterest,
  assertCanTransition,
  defaultExpiry,
  isEditable,
  isPubliclyListed,
  isTransitionAllowed,
  type RequirementFacts,
} from '@/server/domain/requirement/rules';
import { REQUIREMENT_STATUSES } from '@/server/domain/constants';

const NOW = new Date('2026-09-01T10:00:00Z');
const LATER = new Date('2026-10-01T10:00:00Z');
const EARLIER = new Date('2026-08-01T10:00:00Z');

const requirement = (overrides: Partial<RequirementFacts> = {}): RequirementFacts => ({
  status: 'open',
  expiresAt: LATER,
  hiddenAt: null,
  engagementCount: 0,
  ...overrides,
});

describe('requirement lifecycle', () => {
  it('allows open to move to any terminal state', () => {
    expect(isTransitionAllowed('open', 'filled')).toBe(true);
    expect(isTransitionAllowed('open', 'closed')).toBe(true);
    expect(isTransitionAllowed('open', 'expired')).toBe(true);
  });

  it('treats filled, closed and expired as terminal', () => {
    // Re-opening is deliberately unsupported: a requirement that comes back is
    // a new requirement, and conflating them makes engagement history
    // ambiguous.
    for (const terminal of ['filled', 'closed', 'expired'] as const) {
      for (const target of REQUIREMENT_STATUSES) {
        expect(isTransitionAllowed(terminal, target), `${terminal} -> ${target}`).toBe(false);
      }
    }
  });
});

describe('the filled-requires-engagement invariant', () => {
  it('refuses to mark a requirement filled with no engagement recorded', () => {
    // Section 5. Without this, "filled" is a meaningless flag and Stage 2 has
    // nothing real to compute credibility from.
    expect(() => assertCanTransition(requirement({ engagementCount: 0 }), 'filled')).toThrow(
      /engagement.needEngagementError/,
    );
  });

  it('allows filled once at least one engagement exists', () => {
    expect(() =>
      assertCanTransition(requirement({ engagementCount: 1 }), 'filled'),
    ).not.toThrow();
  });

  it('does not require an engagement to close or expire', () => {
    // An employer who simply changed their mind must not be forced to invent
    // an outcome in order to take the posting down.
    expect(() => assertCanTransition(requirement(), 'closed')).not.toThrow();
    expect(() => assertCanTransition(requirement(), 'expired')).not.toThrow();
  });

  it('rejects an illegal transition before checking engagements', () => {
    expect(() =>
      assertCanTransition(requirement({ status: 'closed', engagementCount: 5 }), 'filled'),
    ).toThrow();
  });
});

describe('public listing', () => {
  it('lists an open, unexpired, unhidden requirement', () => {
    expect(isPubliclyListed(requirement(), NOW)).toBe(true);
    expect(acceptsInterest(requirement(), NOW)).toBe(true);
  });

  it('hides a requirement whose clock has run out even if still marked open', () => {
    // Expiry must not depend on a background sweeper having run — otherwise a
    // stalled job leaves stale postings collecting interest.
    const stale = requirement({ status: 'open', expiresAt: EARLIER });

    expect(isPubliclyListed(stale, NOW)).toBe(false);
    expect(acceptsInterest(stale, NOW)).toBe(false);
  });

  it('hides a moderated requirement regardless of status', () => {
    expect(isPubliclyListed(requirement({ hiddenAt: NOW }), NOW)).toBe(false);
    expect(acceptsInterest(requirement({ hiddenAt: NOW }), NOW)).toBe(false);
  });

  it('hides every non-open status', () => {
    for (const status of REQUIREMENT_STATUSES) {
      const expected = status === 'open';
      expect(isPubliclyListed(requirement({ status }), NOW), status).toBe(expected);
    }
  });
});

describe('editability', () => {
  it('allows editing only while open', () => {
    for (const status of REQUIREMENT_STATUSES) {
      expect(isEditable(requirement({ status })), status).toBe(status === 'open');
    }
  });
});

describe('defaultExpiry', () => {
  it('is thirty days out', () => {
    const expiry = defaultExpiry(NOW);
    const days = (expiry.getTime() - NOW.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBe(30);
  });
});
