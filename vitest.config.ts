import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Vite resolves the `@/*` paths from tsconfig.json natively; no plugin needed.
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Playwright specs live in e2e/ and are run by `npm run test:e2e`.
    exclude: ['node_modules/**', '.next/**', 'e2e/**'],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/server/**'],
      exclude: ['src/server/**/*.test.ts'],
    },
  },
});
