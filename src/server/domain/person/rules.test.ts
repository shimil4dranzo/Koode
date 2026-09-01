import { describe, expect, it } from 'vitest';
import {
  ANONYMISED_DISPLAY_NAME,
  canAct,
  canAdminister,
  canModerate,
  canRecommend,
  displayNameFor,
  isContactable,
  isPubliclyVisible,
  type PersonFacts,
} from '@/server/domain/person/rules';
import { PERSON_STATUSES } from '@/server/domain/constants';

const person = (overrides: Partial<PersonFacts> = {}): PersonFacts => ({
  status: 'active',
  anonymizedAt: null,
  ...overrides,
});

describe('person visibility — Section 6 invariants', () => {
  it('hides a pending_claim person from everyone', () => {
    // The rule the whole third-party-data model rests on: somebody entered
    // this person's details without them present, so nothing is shown until
    // they claim it.
    const pending = person({ status: 'pending_claim' });

    expect(isPubliclyVisible(pending)).toBe(false);
    expect(isContactable(pending)).toBe(false);
    expect(canAct(pending)).toBe(false);
  });

  it('shows an active person', () => {
    expect(isPubliclyVisible(person())).toBe(true);
    expect(isContactable(person())).toBe(true);
    expect(canAct(person())).toBe(true);
  });

  it('hides a suspended person and stops them acting', () => {
    const suspended = person({ status: 'suspended' });

    expect(isPubliclyVisible(suspended)).toBe(false);
    expect(isContactable(suspended)).toBe(false);
    expect(canAct(suspended)).toBe(false);
  });

  it('hides an anonymised person regardless of status', () => {
    // Deletion anonymises rather than cascading, so the row survives with an
    // 'active' status. The anonymisation timestamp must win.
    for (const status of PERSON_STATUSES) {
      const removed = person({ status, anonymizedAt: new Date() });

      expect(isPubliclyVisible(removed), status).toBe(false);
      expect(isContactable(removed), status).toBe(false);
      expect(canAct(removed), status).toBe(false);
      expect(canRecommend(removed), status).toBe(false);
      expect(canModerate(removed), status).toBe(false);
      expect(canAdminister(removed), status).toBe(false);
    }
  });

  it('never lets a non-active status become visible or contactable', () => {
    // Exhaustive over the status list, so adding a status forces a decision
    // here rather than silently defaulting to visible.
    for (const status of PERSON_STATUSES) {
      const expected = status === 'active';
      expect(isPubliclyVisible(person({ status })), status).toBe(expected);
      expect(isContactable(person({ status })), status).toBe(expected);
    }
  });
});

describe('recommendation eligibility', () => {
  it('currently allows any active person to recommend', () => {
    // Documents the CURRENT product decision, not a permanent one. If the
    // stricter KVVES-members-only policy is adopted, this test should be
    // inverted deliberately — see ARCHITECTURE.md §Open decisions.
    expect(canRecommend(person({ hasVerifiedMembership: false }))).toBe(true);
    expect(canRecommend(person({ hasVerifiedMembership: true }))).toBe(true);
  });

  it('never lets a pending_claim or suspended person recommend', () => {
    expect(canRecommend(person({ status: 'pending_claim' }))).toBe(false);
    expect(canRecommend(person({ status: 'suspended' }))).toBe(false);
  });
});

describe('privileged roles', () => {
  it('grants moderation to moderators and admins only', () => {
    expect(canModerate(person({ platformRole: 'none' }))).toBe(false);
    expect(canModerate(person({ platformRole: 'moderator' }))).toBe(true);
    expect(canModerate(person({ platformRole: 'admin' }))).toBe(true);
  });

  it('grants administration to admins only', () => {
    expect(canAdminister(person({ platformRole: 'none' }))).toBe(false);
    expect(canAdminister(person({ platformRole: 'moderator' }))).toBe(false);
    expect(canAdminister(person({ platformRole: 'admin' }))).toBe(true);
  });

  it('strips privileges from a suspended admin', () => {
    // A suspended moderator must not be able to un-suspend themselves.
    const suspendedAdmin = person({ status: 'suspended', platformRole: 'admin' });

    expect(canModerate(suspendedAdmin)).toBe(false);
    expect(canAdminister(suspendedAdmin)).toBe(false);
  });
});

describe('displayNameFor', () => {
  it('returns the stored name for a live person', () => {
    expect(displayNameFor(person(), 'Ravi')).toBe('Ravi');
  });

  it('replaces the name of an anonymised person', () => {
    expect(displayNameFor(person({ anonymizedAt: new Date() }), 'Ravi')).toBe(
      ANONYMISED_DISPLAY_NAME,
    );
  });
});
