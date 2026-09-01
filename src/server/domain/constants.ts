/**
 * The allowed values for every VARCHAR status column in the schema.
 *
 * These are deliberately not MySQL native ENUMs — altering one rebuilds the
 * table, and these lists will change. The database stores a string; this file
 * is the authority on which strings are legal, and the domain layer is what
 * enforces it.
 *
 * Every list is `as const` so TypeScript derives a union type from it, which
 * means adding a value here immediately produces exhaustiveness errors
 * everywhere it needs handling.
 */

export const LOCALITY_LEVELS = ['state', 'district', 'block', 'panchayat', 'ward'] as const;
export type LocalityLevel = (typeof LOCALITY_LEVELS)[number];

export const CATEGORY_LEVELS = ['tier', 'role'] as const;
export type CategoryLevel = (typeof CATEGORY_LEVELS)[number];

/**
 * `pending_claim` — created by somebody else, not yet confirmed by the person.
 *   Not publicly visible, not searchable, not contactable. This is the state
 *   that makes third-party data entry lawful.
 * `active`        — self-registered, or claimed.
 * `suspended`     — hidden by a moderator.
 */
export const PERSON_STATUSES = ['pending_claim', 'active', 'suspended'] as const;
export type PersonStatus = (typeof PERSON_STATUSES)[number];

export const PLATFORM_ROLES = ['none', 'moderator', 'admin'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const ANCHOR_ORG_TYPES = [
  'merchant_assoc',
  'civic_club',
  'swayamsahaya',
  'residents_assoc',
] as const;
export type AnchorOrgType = (typeof ANCHOR_ORG_TYPES)[number];

/** `office_bearer` is the anchor admin: may verify members of their own org. */
export const MEMBERSHIP_ROLES = ['member', 'office_bearer'] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export const MEMBERSHIP_STATUSES = ['pending', 'verified', 'revoked'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const ENGAGEMENT_TYPES = ['permanent', 'part_time', 'contract', 'one_day'] as const;
export type EngagementType = (typeof ENGAGEMENT_TYPES)[number];

export const PAY_PERIODS = ['hourly', 'daily', 'weekly', 'monthly', 'fixed'] as const;
export type PayPeriod = (typeof PAY_PERIODS)[number];

/**
 * How the employer prefers to be reached. `whatsapp` is a stated preference
 * only — Stage 1 has no WhatsApp integration, it simply tells the candidate
 * which app to open after revealing the number. `email` suits the office and
 * professional tiers, where a phone call mid-shift is the wrong opening move.
 */
export const CONTACT_PREFERENCES = ['call', 'whatsapp', 'email', 'either'] as const;
export type ContactPreference = (typeof CONTACT_PREFERENCES)[number];

export const REQUIREMENT_STATUSES = ['open', 'filled', 'closed', 'expired'] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

export const RECOMMENDATION_STATUSES = ['active', 'withdrawn'] as const;
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

/** How the referrer knows the subject. Shown verbatim next to the vouch. */
export const RELATIONSHIP_CONTEXTS = [
  'employed_them',
  'worked_alongside',
  'hired_for_a_job',
  'family_or_neighbour',
  'known_locally',
  'trained_them',
] as const;
export type RelationshipContext = (typeof RELATIONSHIP_CONTEXTS)[number];

export const CLAIM_STATUSES = ['pending', 'claimed', 'rejected', 'expired'] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const INTEREST_STATUSES = ['expressed', 'shortlisted', 'declined', 'withdrawn'] as const;
export type InterestStatus = (typeof INTEREST_STATUSES)[number];

export const ENGAGEMENT_OUTCOMES = ['completed', 'ongoing', 'did_not_proceed'] as const;
export type EngagementOutcome = (typeof ENGAGEMENT_OUTCOMES)[number];

export const OTP_PURPOSES = ['login', 'claim'] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

export const CONSENT_PURPOSES = ['registration', 'recommendation_subject'] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export const REPORTABLE_ENTITIES = ['requirement', 'recommendation', 'person'] as const;
export type ReportableEntity = (typeof REPORTABLE_ENTITIES)[number];

export const REPORT_REASONS = [
  'not_a_real_job',
  'misleading',
  'abusive',
  'personal_data_misuse',
  'spam',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ['open', 'actioned', 'dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** Runtime membership check that also narrows the type. */
export function isOneOf<T extends readonly string[]>(
  allowed: T,
  value: unknown,
): value is T[number] {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}
