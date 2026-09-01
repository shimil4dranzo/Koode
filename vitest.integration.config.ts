import { defineConfig } from 'vitest/config';

/**
 * Integration tests: real MySQL, real Prisma, real constraints.
 *
 * Kept separate from the unit suite because they need a database and are
 * therefore slower and not runnable on every save. They are not optional
 * extras — several invariants in this codebase are enforced partly by database
 * constraints (the one-active-recommendation-per-pair unique index above all),
 * and a mocked Prisma would prove nothing about those.
 *
 *   TEST_DATABASE_URL=mysql://root:pw@127.0.0.1:3306/Koode npm run test:integration
 *
 * The suites skip themselves with a clear message when TEST_DATABASE_URL is
 * absent, so `npm run verify` stays runnable on a laptop with no database.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // These share one database, so they must not run concurrently.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
