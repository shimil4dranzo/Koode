import type { NextRequest } from 'next/server';
import { handler, ok } from '@/server/http/respond';
import { readJson, readMeta } from '@/server/http/request';
import { sendOtpSchema } from '@/server/http/schemas';
import { sendOtp } from '@/server/services/auth.service';

/**
 * POST /api/auth/otp — issue a one-time password.
 *
 * The response deliberately does not say whether the number is registered.
 * Sign-in and registration are the same flow, so this endpoint cannot be used
 * to discover who is on Koode.
 */
export const POST = handler(async (request: NextRequest) => {
  const body = await readJson(request, sendOtpSchema);
  const meta = readMeta(request);

  const result = await sendOtp(body.phone, body.purpose, meta);

  return ok(result);
});
