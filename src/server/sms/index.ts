import { env } from '@/server/env';
import { maskPhone, phoneLogRef } from '@/server/phone';

/**
 * SMS delivery.
 *
 * No provider has been chosen yet, so there is exactly one implementation: a
 * console stub. The interface exists because a provider will be swapped in
 * later and because the console stub must be impossible to run in production
 * (see src/server/env.ts) — not because we are speculatively abstracting.
 *
 * Whoever adds a real provider: add a class here, add its name to the
 * SMS_PROVIDER enum in env.ts, and change `createSender`. Nothing else in the
 * codebase should need to know.
 */

export type SmsMessage = {
  /** E.164. */
  to: string;
  /** Already localised by the caller — this layer does no translation. */
  body: string;
  /** For logging and provider-side categorisation. */
  kind: 'otp' | 'claim_invitation';
};

export type SmsResult = {
  delivered: boolean;
  /** Provider-side id, where one exists. Never contains the recipient. */
  reference: string | null;
};

export interface SmsSender {
  send(message: SmsMessage): Promise<SmsResult>;
}

/**
 * Writes the message to the server log instead of sending it.
 *
 * The recipient is logged as an irreversible reference, never as digits: an
 * operator needs to correlate "did this user get an SMS" across log lines
 * without the log itself becoming a list of phone numbers. In development the
 * message body is printed in full, because the developer needs to read the
 * one-time password to get through the login screen.
 */
class ConsoleSmsSender implements SmsSender {
  async send(message: SmsMessage): Promise<SmsResult> {
    const reference = `console-${Date.now()}`;

    console.warn(
      [
        '',
        '┌─ SMS (not sent — console provider) ─────────────────────────',
        `│ kind : ${message.kind}`,
        `│ to   : ${phoneLogRef(message.to)}  ${
          env.NODE_ENV === 'development' ? `(${maskPhone(message.to)})` : ''
        }`,
        `│ body : ${message.body}`,
        '└─────────────────────────────────────────────────────────────',
        '',
      ].join('\n'),
    );

    return { delivered: true, reference };
  }
}

let sender: SmsSender | undefined;

export function getSmsSender(): SmsSender {
  if (!sender) {
    switch (env.SMS_PROVIDER) {
      case 'console':
        sender = new ConsoleSmsSender();
        break;
      default: {
        // Exhaustiveness guard: adding a provider to the env enum without
        // wiring it here becomes a compile error.
        const unreachable: never = env.SMS_PROVIDER;
        throw new Error(`Unsupported SMS_PROVIDER: ${String(unreachable)}`);
      }
    }
  }
  return sender;
}

/** Test seam. */
export function __setSmsSenderForTests(next: SmsSender | undefined): void {
  sender = next;
}
