import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AppError, HTTP_STATUS_BY_CODE, isAppError } from '@/server/errors';
import { redactPhonesInText } from '@/server/phone';
import { env } from '@/server/env';

/**
 * The HTTP boundary.
 *
 * Services throw AppError and know nothing about status codes; this is the one
 * place that translates. Keeping it here is what lets a Route Handler, a
 * Server Action and a future WhatsApp bot share the same service functions.
 *
 * The response shape is stable and machine-readable so a native wrapper or a
 * bot can branch on `error.code` rather than parse prose:
 *
 *   { "data": ... }
 *   { "error": { "code": "...", "messageKey": "...", "details": {...} } }
 *
 * `messageKey` points at an i18n message; the client renders it in the user's
 * language. The server never sends a user-facing English sentence.
 */

export type ApiError = {
  code: string;
  messageKey: string;
  details?: Record<string, unknown>;
};

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ data }, { status: 200, ...init });
}

export function created<T>(data: T): NextResponse {
  return NextResponse.json({ data }, { status: 201 });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

/**
 * Turn a Zod issue message into an i18n key.
 *
 * Where a schema supplies its own message it is already a key, like
 * `errors.invalidPhone`. Where it does not, Zod generates English prose
 * ("Too small: expected string to have >=2 characters"), which must never
 * reach a user reading the app in Malayalam — and can quote the offending
 * value, which may be a phone number.
 *
 * Fixed here rather than in each client so a Route Handler, a Server Action
 * and a future bot all get a key, and no client has to guess whether a string
 * is translatable.
 */
function toMessageKey(message: string): string {
  return message.startsWith('errors.') ? message : 'errors.validationFailed';
}

function errorBody(error: AppError): { error: ApiError } {
  return {
    error: {
      code: error.code,
      messageKey: error.messageKey,
      ...(error.details ? { details: error.details } : {}),
    },
  };
}

/**
 * Convert anything thrown inside a handler into a response.
 *
 * Unknown errors become a generic 500 with no detail: an ORM error message can
 * contain a phone number from the failing row, and leaking that through an
 * error body would defeat the whole privacy model. The full error still goes
 * to the server log, with numbers scrubbed.
 */
export function fail(error: unknown): NextResponse {
  if (isAppError(error)) {
    const status = HTTP_STATUS_BY_CODE[error.code];
    const headers: Record<string, string> = {};
    if (error.retryAfter) headers['Retry-After'] = String(error.retryAfter);

    return NextResponse.json(errorBody(error), { status, headers });
  }

  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) {
      const path = issue.path.join('.') || '_';
      fieldErrors[path] ??= toMessageKey(issue.message);
    }

    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_FAILED',
          messageKey: 'errors.validationFailed',
          details: { fields: fieldErrors },
        },
      },
      { status: 400 },
    );
  }

  const message = error instanceof Error ? error.message : 'unknown error';
  console.error('[api] unhandled error:', redactPhonesInText(message));
  if (env.NODE_ENV !== 'production' && error instanceof Error) {
    console.error(error.stack);
  }

  return NextResponse.json(
    { error: { code: 'INTERNAL', messageKey: 'errors.unexpected' } },
    { status: 500 },
  );
}

/**
 * Wrap a Route Handler so every thrown AppError becomes the right response.
 *
 * Without this each handler would need its own try/catch, and the one that
 * forgets leaks a stack trace.
 */
export function handler<Args extends unknown[]>(
  fn: (...args: Args) => Promise<NextResponse>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (error) {
      return fail(error);
    }
  };
}
