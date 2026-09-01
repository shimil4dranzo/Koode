import { config as loadEnv } from 'dotenv';

/**
 * Load environment files the way Next.js does, for the standalone tools that
 * are not Next.js.
 *
 * Next reads `.env.local` before `.env`, and the README tells developers to
 * put their credentials in `.env.local`. Prisma's CLI, the seed runner and the
 * database checker are separate processes that only know about `.env`, so
 * without this they fail with "DATABASE_URL is not set" while the app itself
 * connects perfectly — which is a genuinely confusing way to lose an hour.
 *
 * dotenv never overwrites a variable that is already set, so the first file
 * listed wins and a real environment variable still beats both. That ordering
 * matters in CI, where DATABASE_URL comes from the workflow rather than a file.
 */
loadEnv({ path: '.env.local', quiet: true });
loadEnv({ quiet: true });
