import type { NextRequest } from 'next/server';
import type { ZodType } from 'zod';
import { errors } from '@/server/errors';
import type { RequestMeta } from '@/server/auth/session';

/**
 * Request parsing for Route Handlers.
 *
 * Validation at the boundary is a filter, not the rule: it rejects malformed
 * input early and produces good field-level messages. The rules that matter
 * still live in the domain layer, because a Server Action or a bot reaching the
 * same service must get the same answer.
 */

/** Parse and validate a JSON body. */
export async function readJson<T>(
  request: NextRequest,
  schema: ZodType<T>,
): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw errors.validation();
  }
  // Throws ZodError, which the response layer turns into a 400 with fields.
  return schema.parse(raw);
}

/** Parse and validate query-string parameters. */
export function readQuery<T>(request: NextRequest, schema: ZodType<T>): T {
  const params: Record<string, string> = {};
  request.nextUrl.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return schema.parse(params);
}

/**
 * Client IP and user agent, for the audit log and IP-scoped rate limits.
 *
 * `x-forwarded-for` is only trustworthy behind a proxy that overwrites it. The
 * deployment runbook covers configuring that; a direct-to-internet deployment
 * would let a client forge this header and evade IP-scoped limits.
 */
export function readMeta(request: NextRequest): RequestMeta {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip =
    forwarded?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? null;

  return { ip, userAgent: request.headers.get('user-agent') };
}
