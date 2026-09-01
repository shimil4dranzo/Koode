import Redis from 'ioredis';
import { env } from '@/server/env';
import { errors } from '@/server/errors';

/**
 * Fixed-window rate limiting.
 *
 * A fixed window can let through up to 2x the limit across a window boundary.
 * At Koode's scale — hundreds of users, tens of posts a week — that is
 * irrelevant, and a sliding window costs more Redis round-trips and much more
 * code to reason about. If abuse ever justifies it, this is the one file to
 * change.
 *
 * Without REDIS_URL the limiter falls back to an in-process map. That is fine
 * for a single dev server and useless behind more than one instance, which is
 * why src/server/env.ts refuses to boot production without Redis.
 */

export type RateLimitRule = {
  /** Requests allowed per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets. */
  retryAfter: number;
};

/**
 * The abuse targets named in the brief, plus the ones that follow from the
 * privacy rules. Tuned conservatively: it is easier to loosen a limit after
 * launch than to explain a leak.
 */
export const RATE_LIMITS = {
  /** Sending an OTP costs real money and is the spam vector. */
  otpSend: { limit: 3, windowSeconds: 60 * 60 },
  /** Per-phone verification attempts, to stop brute-forcing a 6-digit code. */
  otpVerify: { limit: 5, windowSeconds: 10 * 60 },
  /** Revealing a phone number — the whole privacy model rests on this. */
  contactReveal: { limit: 15, windowSeconds: 24 * 60 * 60 },
  /** Writing a vouch for somebody. */
  recommendationCreate: { limit: 10, windowSeconds: 24 * 60 * 60 },
  /** Posting work. */
  requirementCreate: { limit: 10, windowSeconds: 24 * 60 * 60 },
  /** Expressing interest, to stop a candidate spraying every listing. */
  interestCreate: { limit: 30, windowSeconds: 24 * 60 * 60 },
  /** Re-sending a claim invitation to somebody who has not responded. */
  claimResend: { limit: 3, windowSeconds: 24 * 60 * 60 },
  /** Guessing a password. Per-account, on top of the per-IP anonymous cap. */
  passwordLogin: { limit: 5, windowSeconds: 15 * 60 },
  /** Blunt per-IP ceiling on unauthenticated write endpoints. */
  anonymousWrite: { limit: 30, windowSeconds: 60 * 60 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

// --- Backends --------------------------------------------------------------

interface LimiterBackend {
  /** Increment the counter for `key` and report the new count. */
  hit(key: string, windowSeconds: number): Promise<{ count: number; ttl: number }>;
  reset(key: string): Promise<void>;
}

class RedisBackend implements LimiterBackend {
  constructor(private readonly redis: Redis) {}

  async hit(key: string, windowSeconds: number): Promise<{ count: number; ttl: number }> {
    // INCR then EXPIRE-if-new, in one round trip. The counter is created by
    // INCR returning 1, which is the only moment the TTL needs setting.
    const results = await this.redis
      .multi()
      .incr(key)
      .expire(key, windowSeconds, 'NX')
      .ttl(key)
      .exec();

    const count = Number(results?.[0]?.[1] ?? 0);
    const ttlRaw = Number(results?.[2]?.[1] ?? windowSeconds);
    // TTL returns -1 for "no expiry" and -2 for "no key"; treat both as a
    // fresh full window rather than telling the caller to retry immediately.
    const ttl = ttlRaw > 0 ? ttlRaw : windowSeconds;

    return { count, ttl };
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(key);
  }
}

class MemoryBackend implements LimiterBackend {
  private readonly windows = new Map<string, { count: number; expiresAt: number }>();

  async hit(key: string, windowSeconds: number): Promise<{ count: number; ttl: number }> {
    const now = Date.now();
    this.sweep(now);

    const existing = this.windows.get(key);
    if (!existing || existing.expiresAt <= now) {
      const expiresAt = now + windowSeconds * 1000;
      this.windows.set(key, { count: 1, expiresAt });
      return { count: 1, ttl: windowSeconds };
    }

    existing.count += 1;
    return {
      count: existing.count,
      ttl: Math.max(1, Math.ceil((existing.expiresAt - now) / 1000)),
    };
  }

  async reset(key: string): Promise<void> {
    this.windows.delete(key);
  }

  /** Bounded cleanup so a long-lived dev server does not grow without limit. */
  private sweep(now: number): void {
    if (this.windows.size < 5_000) return;
    for (const [key, value] of this.windows) {
      if (value.expiresAt <= now) this.windows.delete(key);
    }
  }
}

// --- Wiring ----------------------------------------------------------------

const globalForLimiter = globalThis as unknown as {
  koodeLimiter?: LimiterBackend;
  koodeRedis?: Redis;
};

function createBackend(): LimiterBackend {
  if (!env.REDIS_URL) {
    console.warn(
      '[ratelimit] REDIS_URL is not set — using the in-process limiter. ' +
        'This protects a single process only and is refused in production.',
    );
    return new MemoryBackend();
  }

  const redis =
    globalForLimiter.koodeRedis ??
    new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      lazyConnect: false,
      enableOfflineQueue: false,
    });

  redis.on('error', (error: Error) => {
    // Never log the URL: it carries credentials.
    console.error('[ratelimit] redis error:', error.message);
  });

  if (env.NODE_ENV !== 'production') globalForLimiter.koodeRedis = redis;

  return new RedisBackend(redis);
}

function backend(): LimiterBackend {
  if (!globalForLimiter.koodeLimiter) {
    globalForLimiter.koodeLimiter = createBackend();
  }
  return globalForLimiter.koodeLimiter;
}

/**
 * Check and consume one unit against a named limit.
 *
 * `subject` identifies who is being limited — a phone number hash, a person's
 * public id, or a hashed IP. It must never be a raw phone number: these keys
 * live in Redis, which is not a place for personal data.
 */
export async function checkRateLimit(
  name: RateLimitName,
  subject: string,
): Promise<RateLimitResult> {
  const rule = RATE_LIMITS[name];
  const key = `koode:rl:${name}:${subject}`;

  try {
    const { count, ttl } = await backend().hit(key, rule.windowSeconds);
    return {
      allowed: count <= rule.limit,
      remaining: Math.max(0, rule.limit - count),
      retryAfter: ttl,
    };
  } catch (error) {
    // Fail OPEN on infrastructure failure.
    //
    // This is a deliberate trade-off and the reasoning belongs on the record:
    // if Redis is down, failing closed would lock every user out of logging in,
    // which is a total outage. Failing open degrades abuse protection for the
    // duration instead. The limits here guard against nuisance and cost, not
    // against a determined attacker with a working exploit — and the audit log
    // still records everything that happened.
    console.error(
      '[ratelimit] backend unavailable, allowing request:',
      error instanceof Error ? error.message : 'unknown error',
    );
    return { allowed: true, remaining: 0, retryAfter: 0 };
  }
}

/** Consume one unit and throw a domain error if the limit is exceeded. */
export async function enforceRateLimit(
  name: RateLimitName,
  subject: string,
): Promise<void> {
  const result = await checkRateLimit(name, subject);
  if (!result.allowed) {
    throw errors.rateLimited(result.retryAfter);
  }
}

/** Used by tests and by the admin console when clearing a mistaken lockout. */
export async function resetRateLimit(name: RateLimitName, subject: string): Promise<void> {
  await backend().reset(`koode:rl:${name}:${subject}`);
}

/** Test seam: swap in a clean in-process backend. */
export function __setLimiterBackendForTests(next?: LimiterBackend): void {
  globalForLimiter.koodeLimiter = next ?? new MemoryBackend();
}
