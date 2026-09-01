import { readFile } from 'node:fs/promises';
import { normalizePhone } from '../src/server/phone.ts';

/**
 * Read what the console SMS provider "sent".
 *
 * This is the seam that makes the claim flow testable without a real SMS
 * provider. The app appends every message to SMS_LOG_FILE as JSON lines; these
 * helpers read the most recent one for a given number.
 *
 * Deliberately a file rather than a test-only HTTP endpoint. An endpoint that
 * returns one-time passwords is a liability no matter what guard sits in front
 * of it, and it would exist in the deployed application.
 */

export const SMS_LOG_FILE = process.env.SMS_LOG_FILE ?? '/tmp/koode-e2e-sms.log';

type SmsRecord = {
  at: string;
  reference: string;
  kind: 'otp' | 'claim_invitation';
  to: string;
  body: string;
};

async function readAll(): Promise<SmsRecord[]> {
  let raw: string;
  try {
    raw = await readFile(SMS_LOG_FILE, 'utf8');
  } catch {
    return [];
  }

  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as SmsRecord);
}

/**
 * Wait for the newest message to a number, since messages are written by the
 * server slightly after the request that triggered them returns.
 */
async function waitForMessage(
  phone: string,
  kind: SmsRecord['kind'],
  timeoutMs = 10_000,
): Promise<SmsRecord> {
  const normalized = normalizePhone(phone);
  if (!normalized) throw new Error(`Not a valid phone number: ${phone}`);

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const matches = (await readAll()).filter(
      (record) => record.to === normalized && record.kind === kind,
    );
    const latest = matches.at(-1);
    if (latest) return latest;

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(
    `No ${kind} SMS for ${normalized} within ${timeoutMs}ms.\n` +
      `Is the app running with SMS_LOG_FILE=${SMS_LOG_FILE} and SMS_PROVIDER=console?`,
  );
}

/** The six-digit code from the most recent OTP message to this number. */
export async function readOtpCode(phone: string): Promise<string> {
  const record = await waitForMessage(phone, 'otp');
  const match = /\b(\d{6})\b/.exec(record.body);
  if (!match?.[1]) throw new Error(`No 6-digit code in SMS body: ${record.body}`);
  return match[1];
}

/** The claim token from the most recent invitation to this number. */
export async function readClaimToken(phone: string): Promise<string> {
  const record = await waitForMessage(phone, 'claim_invitation');
  const match = /\/claim\/([A-Za-z0-9_-]+)/.exec(record.body);
  if (!match?.[1]) throw new Error(`No claim link in SMS body: ${record.body}`);
  return match[1];
}

/** Truncate between tests so "most recent" means what it says. */
export async function clearSmsLog(): Promise<void> {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(SMS_LOG_FILE, '', 'utf8').catch(() => {
    // Nothing to clear yet.
  });
}
