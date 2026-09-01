/**
 * The error taxonomy.
 *
 * Domain code throws these; the HTTP layer is the only place that knows about
 * status codes. That keeps the domain callable from a Route Handler, a Server
 * Action, and a future WhatsApp bot without any of them re-deriving what a
 * violation means.
 *
 * `code` is a stable machine-readable string. `messageKey` points at an i18n
 * message so the user sees Malayalam or English, never a raw English string
 * baked into a service.
 */

export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INVARIANT_VIOLATION'
  | 'CAPABILITY_DISABLED'
  | 'INTERNAL';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly messageKey: string;
  readonly details: Record<string, unknown> | undefined;
  /** Seconds until the caller may retry. Only set for RATE_LIMITED. */
  readonly retryAfter: number | undefined;

  constructor(
    code: ErrorCode,
    messageKey: string,
    options?: { details?: Record<string, unknown>; retryAfter?: number; cause?: unknown },
  ) {
    super(`${code}: ${messageKey}`, options?.cause ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.messageKey = messageKey;
    this.details = options?.details;
    this.retryAfter = options?.retryAfter;
  }
}

export const errors = {
  validation: (messageKey = 'errors.validationFailed', details?: Record<string, unknown>) =>
    new AppError('VALIDATION_FAILED', messageKey, { details }),

  unauthenticated: (messageKey = 'errors.signInRequired') =>
    new AppError('UNAUTHENTICATED', messageKey),

  forbidden: (messageKey = 'errors.notAllowed') => new AppError('FORBIDDEN', messageKey),

  notFound: (messageKey = 'errors.notFound') => new AppError('NOT_FOUND', messageKey),

  conflict: (messageKey: string, details?: Record<string, unknown>) =>
    new AppError('CONFLICT', messageKey, { details }),

  rateLimited: (retryAfter: number, messageKey = 'errors.tooManyRequests') =>
    new AppError('RATE_LIMITED', messageKey, { retryAfter }),

  /** A rule from the domain model was broken. These are the ones that matter. */
  invariant: (messageKey: string, details?: Record<string, unknown>) =>
    new AppError('INVARIANT_VIOLATION', messageKey, { details }),

  /** The feature exists but is switched off in this environment. */
  capabilityDisabled: (messageKey: string) => new AppError('CAPABILITY_DISABLED', messageKey),

  internal: (messageKey = 'errors.unexpected', cause?: unknown) =>
    new AppError('INTERNAL', messageKey, { cause }),
} as const;

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/** The only place that maps domain failures onto HTTP. */
export const HTTP_STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVARIANT_VIOLATION: 422,
  CAPABILITY_DISABLED: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};
