import { z } from 'zod';

/**
 * Environment validation, run once at module load on the server.
 *
 * A missing secret should stop the process at boot, not surface as a confusing
 * 500 three weeks later. Anything optional has an explicit, documented default.
 */

/**
 * `next build` runs with NODE_ENV=production, but a build machine is not a
 * deployment: CI has no production Redis and no SMS credentials, and it should
 * not need them to compile. The hard guards below therefore apply at runtime
 * only, which is where a misconfiguration would actually harm someone.
 */
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';
const isProduction = process.env.NODE_ENV === 'production' && !isBuildPhase;

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required — copy .env.example to .env.local')
    .refine((v) => v.startsWith('mysql://'), 'DATABASE_URL must be a mysql:// URL'),

  /** Blank falls back to an in-process limiter; refused in production. */
  REDIS_URL: z.string().optional().default(''),

  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  IP_HASH_SECRET: z.string().min(32, 'IP_HASH_SECRET must be at least 32 characters'),

  SMS_PROVIDER: z.enum(['console']).default('console'),

  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),

  ALLOW_RECOMMENDING_NON_USERS: z
    .string()
    .optional()
    .default('false')
    .transform((v) => v === 'true'),

  SEED_ADMIN_PHONES: z.string().optional().default(''),
});

export type Env = z.infer<typeof schema>;

/**
 * During `next build`, secrets that only matter when serving a request are
 * substituted with obvious placeholders so that CI can compile the app without
 * being handed production credentials. Nothing here reaches a running server:
 * the same variables are re-read and fully validated at boot.
 */
const BUILD_PLACEHOLDERS: Record<string, string> = {
  DATABASE_URL: 'mysql://build:build@127.0.0.1:3306/Koode',
  SESSION_SECRET: 'build-phase-placeholder-secret-not-for-runtime',
  IP_HASH_SECRET: 'build-phase-placeholder-secret-not-for-runtime',
};

function load(): Env {
  const source: Record<string, string | undefined> = { ...process.env };

  if (isBuildPhase) {
    for (const [key, placeholder] of Object.entries(BUILD_PLACEHOLDERS)) {
      source[key] ||= placeholder;
    }
  }

  const parsed = schema.safeParse(source);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}\n`);
  }

  const env = parsed.data;

  // Guardrails that only apply once this is serving real people.
  if (isProduction) {
    if (!env.REDIS_URL) {
      throw new Error(
        'REDIS_URL is required in production. The in-process rate limiter is ' +
          'per-process and provides no protection behind more than one instance.',
      );
    }
    if (env.SMS_PROVIDER === 'console') {
      throw new Error(
        'SMS_PROVIDER=console cannot be used in production: one-time passwords ' +
          'would be written to the server log instead of being delivered.',
      );
    }
    if (env.NEXT_PUBLIC_APP_URL.startsWith('http://')) {
      throw new Error('NEXT_PUBLIC_APP_URL must be https:// in production.');
    }
  }

  return env;
}

export const env: Env = load();
