import { z } from 'zod';
import { normalizePhone } from '@/server/phone';
import { isPublicId } from '@/server/ids';
import {
  CONTACT_PREFERENCES,
  ENGAGEMENT_OUTCOMES,
  ENGAGEMENT_TYPES,
  INTEREST_STATUSES,
  PAY_PERIODS,
  RELATIONSHIP_CONTEXTS,
  REPORTABLE_ENTITIES,
  REPORT_REASONS,
} from '@/server/domain/constants';

/**
 * Shared request schemas.
 *
 * Kept in one file so the same shape is used by a Route Handler, a Server
 * Action and — later — a bot, rather than three slightly different validations
 * drifting apart.
 */

/**
 * Accepts any spelling of an Indian mobile number and yields E.164.
 *
 * Normalising inside the schema rather than in each handler means there is no
 * path where an un-normalised number reaches the database and creates a
 * duplicate Person for the same human.
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const normalized = normalizePhone(value);
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: 'errors.invalidPhone' });
      return z.NEVER;
    }
    return normalized;
  });

export const otpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'errors.invalidOtp');

export const publicIdSchema = z.string().refine(isPublicId, 'errors.notFound');

export const localeSchema = z.enum(['ml', 'en']);

/** A person's own name, or the name a referrer gives for somebody else. */
export const displayNameSchema = z
  .string()
  .trim()
  .min(2, 'errors.validationFailed')
  .max(120, 'errors.validationFailed');

export const sendOtpSchema = z.object({
  phone: phoneSchema,
  purpose: z.enum(['login', 'claim']).default('login'),
});

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code: otpCodeSchema,
});

/**
 * The second step of registration.
 *
 * There is no `phone` or `code` here on purpose: the number comes from the
 * signed verification ticket set by /api/auth/verify, so a client cannot
 * register an account for a number it never proved control of.
 */
export const registerSchema = z.object({
  displayName: displayNameSchema,
  localityPublicId: publicIdSchema.optional(),
  locale: localeSchema,
  consentVersion: z.string().min(1),
});

export const acceptConsentSchema = z.object({
  locale: localeSchema,
  consentVersion: z.string().min(1),
});

export const updateProfileSchema = z.object({
  displayName: displayNameSchema.optional(),
  localityPublicId: publicIdSchema.nullish(),
  headline: z.string().trim().max(200).nullish(),
});

export const personSkillSchema = z.object({
  categoryPublicId: publicIdSchema,
  yearsExperience: z.coerce.number().int().min(0).max(70).nullish(),
  qualificationNote: z.string().trim().max(200).nullish(),
});

/**
 * Posting a requirement.
 *
 * Only title, category, locality and engagement type are required — the brief
 * asks for posting to take under a minute, and every optional field left
 * optional is a field an employer does not have to think about.
 */
export const createRequirementSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    description: z.string().trim().max(4000).default(''),
    categoryPublicId: publicIdSchema,
    localityPublicId: publicIdSchema,
    engagementType: z.enum(ENGAGEMENT_TYPES),
    payMin: z.coerce.number().min(0).max(99_999_999).nullish(),
    payMax: z.coerce.number().min(0).max(99_999_999).nullish(),
    payPeriod: z.enum(PAY_PERIODS).nullish(),
    contactPreference: z.enum(CONTACT_PREFERENCES).default('call'),
    vacancies: z.coerce.number().int().min(1).max(999).default(1),
  })
  .refine((data) => data.payMin == null || data.payMax == null || data.payMin <= data.payMax, {
    message: 'errors.validationFailed',
    path: ['payMax'],
  })
  .refine((data) => (data.payMin == null && data.payMax == null) || data.payPeriod != null, {
    // A number with no period is meaningless: is ₹800 a day or a month?
    message: 'errors.validationFailed',
    path: ['payPeriod'],
  });

export const updateRequirementSchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  description: z.string().trim().max(4000).optional(),
  engagementType: z.enum(ENGAGEMENT_TYPES).optional(),
  payMin: z.coerce.number().min(0).max(99_999_999).nullish(),
  payMax: z.coerce.number().min(0).max(99_999_999).nullish(),
  payPeriod: z.enum(PAY_PERIODS).nullish(),
  contactPreference: z.enum(CONTACT_PREFERENCES).optional(),
  vacancies: z.coerce.number().int().min(1).max(999).optional(),
});

/** Moving a requirement to a terminal state. `expired` is set by the sweeper. */
export const requirementStatusSchema = z.object({
  status: z.enum(['filled', 'closed']),
});

export const searchRequirementsSchema = z.object({
  locality: publicIdSchema.optional(),
  category: publicIdSchema.optional(),
  engagementType: z.enum(ENGAGEMENT_TYPES).optional(),
  /** Include localities that border the selected one. */
  nearby: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/**
 * Writing a recommendation.
 *
 * Either an existing person (by public id) or somebody not yet on Koode (by
 * phone and name). The second path is the legally sensitive one and is gated
 * by ALLOW_RECOMMENDING_NON_USERS in the service.
 */
export const createRecommendationSchema = z
  .object({
    subjectPublicId: publicIdSchema.optional(),
    subjectPhone: phoneSchema.optional(),
    subjectName: displayNameSchema.optional(),
    relationshipContext: z.enum(RELATIONSHIP_CONTEXTS),
    categoryPublicId: publicIdSchema.nullish(),
    note: z.string().trim().min(10, 'errors.validationFailed').max(2000),
  })
  .refine(
    (data) =>
      Boolean(data.subjectPublicId) || (Boolean(data.subjectPhone) && Boolean(data.subjectName)),
    { message: 'errors.validationFailed', path: ['subjectPhone'] },
  );

export const withdrawRecommendationSchema = z.object({
  reason: z.string().trim().max(255).optional(),
});

export const claimDecisionSchema = z.object({
  token: z.string().min(10),
  code: otpCodeSchema,
  decision: z.enum(['accept', 'reject']),
  displayName: displayNameSchema.optional(),
  locale: localeSchema.default('ml'),
  consentVersion: z.string().optional(),
});

export const expressInterestSchema = z.object({
  note: z.string().trim().max(500).nullish(),
});

export const updateInterestSchema = z.object({
  status: z.enum(INTEREST_STATUSES),
});

export const recordEngagementSchema = z.object({
  personPublicId: publicIdSchema,
  outcome: z.enum(ENGAGEMENT_OUTCOMES),
  note: z.string().trim().max(500).nullish(),
});

export const reportSchema = z.object({
  entityType: z.enum(REPORTABLE_ENTITIES),
  entityId: publicIdSchema,
  reason: z.enum(REPORT_REASONS),
  detail: z.string().trim().max(500).nullish(),
});
