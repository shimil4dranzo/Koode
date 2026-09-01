import type { PersonStatus, PlatformRole } from '@/server/domain/constants';

/**
 * Person rules — pure functions, no I/O, no framework.
 *
 * These are the privacy rules from Section 6 expressed as code. They are here,
 * rather than inline in a service or a Zod schema at the route boundary, so
 * that a Route Handler, a Server Action and a future WhatsApp bot all get the
 * same answer, and so they can be exhaustively unit-tested without a database.
 */

/** The minimum a rule needs to know about a person. */
export type PersonFacts = {
  status: PersonStatus;
  anonymizedAt: Date | null;
  platformRole?: PlatformRole;
  hasVerifiedMembership?: boolean;
};

/**
 * May this person's profile be shown to anyone else?
 *
 * `pending_claim` is the important case: the row exists because a referrer
 * entered somebody else's details, and that person has not agreed to anything
 * yet. Until they claim it, they are not listed, not searchable, and not
 * contactable.
 */
export function isPubliclyVisible(person: PersonFacts): boolean {
  if (person.anonymizedAt !== null) return false;
  return person.status === 'active';
}

/**
 * May somebody reveal this person's phone number?
 *
 * Identical to visibility today. It is a separate function because the two
 * answers are separate questions, and the day they diverge — a person who is
 * listed but has muted contact — this is the one place to change.
 */
export function isContactable(person: PersonFacts): boolean {
  return isPubliclyVisible(person);
}

/** May this person take actions of their own — post, express interest, edit? */
export function canAct(person: PersonFacts): boolean {
  if (person.anonymizedAt !== null) return false;
  return person.status === 'active';
}

/**
 * May this person write a recommendation?
 *
 * PRODUCT DECISION, PENDING CONFIRMATION (ARCHITECTURE.md §Open decisions).
 *
 * The brief proposed restricting this to verified KVVES members. That is
 * defensible for trust and fatal for cold start: at launch there are no
 * verified members, so there would be no recommendations, and the graph that
 * makes Koode worth using would never begin to exist.
 *
 * The current rule is therefore: any person who can act may recommend, and
 * verified membership is surfaced as a badge on the recommendation instead —
 * the reader weighs the vouch, rather than the platform silently discarding
 * everyone's.
 *
 * To adopt the stricter policy, change the return below to also require
 * `person.hasVerifiedMembership === true`. Everything else — the API, the UI
 * error message (`recommendations.notVerifiedError`), the tests — is already
 * in place for it.
 */
export function canRecommend(person: PersonFacts): boolean {
  return canAct(person);
}

/** May this person use the moderation console? */
export function canModerate(person: PersonFacts): boolean {
  if (!canAct(person)) return false;
  return person.platformRole === 'moderator' || person.platformRole === 'admin';
}

/** May this person change the locality and category taxonomy, or grant roles? */
export function canAdminister(person: PersonFacts): boolean {
  if (!canAct(person)) return false;
  return person.platformRole === 'admin';
}

/**
 * What a person is called when they cannot be named.
 *
 * Used after anonymisation so that a recommendation written about them still
 * reads as a record of something that happened, without identifying anyone.
 */
export const ANONYMISED_DISPLAY_NAME = 'Removed account';

export function displayNameFor(person: PersonFacts, storedName: string): string {
  return person.anonymizedAt !== null ? ANONYMISED_DISPLAY_NAME : storedName;
}
