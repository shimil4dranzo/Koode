import { beforeEach, describe, expect, it } from 'vitest';
import {
  RATE_LIMITS,
  __setLimiterBackendForTests,
  checkRateLimit,
  enforceRateLimit,
  resetRateLimit,
} from '@/server/ratelimit';
import { AppError } from '@/server/errors';

describe('rate limiting', () => {
  beforeEach(() => {
    __setLimiterBackendForTests();
  });

  it('allows exactly `limit` requests then refuses', async () => {
    const { limit } = RATE_LIMITS.otpSend;

    for (let i = 0; i < limit; i += 1) {
      const result = await checkRateLimit('otpSend', 'subject-a');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(limit - i - 1);
    }

    const blocked = await checkRateLimit('otpSend', 'subject-a');
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it('counts each subject separately', async () => {
    for (let i = 0; i < RATE_LIMITS.otpSend.limit; i += 1) {
      await checkRateLimit('otpSend', 'subject-a');
    }

    expect((await checkRateLimit('otpSend', 'subject-a')).allowed).toBe(false);
    expect((await checkRateLimit('otpSend', 'subject-b')).allowed).toBe(true);
  });

  it('counts each named limit separately', async () => {
    for (let i = 0; i < RATE_LIMITS.otpSend.limit; i += 1) {
      await checkRateLimit('otpSend', 'shared');
    }

    expect((await checkRateLimit('otpSend', 'shared')).allowed).toBe(false);
    expect((await checkRateLimit('contactReveal', 'shared')).allowed).toBe(true);
  });

  it('throws a RATE_LIMITED AppError carrying retryAfter', async () => {
    for (let i = 0; i < RATE_LIMITS.otpSend.limit; i += 1) {
      await enforceRateLimit('otpSend', 'thrower');
    }

    await expect(enforceRateLimit('otpSend', 'thrower')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });

    const error = await enforceRateLimit('otpSend', 'thrower').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).retryAfter).toBeGreaterThan(0);
  });

  it('clears a lockout on reset', async () => {
    for (let i = 0; i < RATE_LIMITS.otpSend.limit; i += 1) {
      await checkRateLimit('otpSend', 'resettable');
    }
    expect((await checkRateLimit('otpSend', 'resettable')).allowed).toBe(false);

    await resetRateLimit('otpSend', 'resettable');
    expect((await checkRateLimit('otpSend', 'resettable')).allowed).toBe(true);
  });

  it('fails open when the backend throws, rather than locking everyone out', async () => {
    __setLimiterBackendForTests({
      hit: async () => {
        throw new Error('redis is down');
      },
      reset: async () => {},
    });

    // A Redis outage must degrade abuse protection, not cause a total outage.
    await expect(enforceRateLimit('otpSend', 'anyone')).resolves.toBeUndefined();
  });

  it('keeps every configured limit positive and bounded', () => {
    for (const [name, rule] of Object.entries(RATE_LIMITS)) {
      expect(rule.limit, name).toBeGreaterThan(0);
      expect(rule.windowSeconds, name).toBeGreaterThan(0);
      expect(rule.windowSeconds, name).toBeLessThanOrEqual(24 * 60 * 60);
    }
  });
});
