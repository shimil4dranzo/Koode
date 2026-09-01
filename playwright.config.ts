import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests.
 *
 * The brief singles out the claim flow as needing end-to-end coverage, and it
 * is right to: it is the most legally consequential path in the product, it
 * spans four screens and two entities, and every unit test around it verifies
 * a piece rather than the promise.
 *
 * These need a running app AND a seeded database, so they are not part of
 * `npm run verify`. Run them deliberately:
 *
 *   docker compose up -d
 *   npm run db:deploy && npm run db:seed
 *   npm run test:e2e
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    // The target device, not a desktop browser at a phone-ish width.
    ...devices['Pixel 5'],
  },

  projects: [{ name: 'mobile-chrome', use: { ...devices['Pixel 5'] } }],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
