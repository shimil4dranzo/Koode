/**
 * Vitest global setup.
 *
 * Unit tests must run with no database, no Redis and no network — that is what
 * makes them fast enough to run on every save. Integration tests opt in by
 * setting TEST_DATABASE_URL and are skipped otherwise (see tests/integration).
 */

// NODE_ENV is typed read-only by @types/node; Vitest already sets it to 'test'.
process.env.DATABASE_URL ??= 'mysql://root:test@127.0.0.1:3306/Koode';
process.env.SESSION_SECRET ??= 'test-session-secret-at-least-32-chars-long';
process.env.IP_HASH_SECRET ??= 'test-ip-hash-secret-at-least-32-chars-long';
process.env.SMS_PROVIDER ??= 'console';
process.env.NEXT_PUBLIC_APP_URL ??= 'http://localhost:3000';
process.env.ALLOW_RECOMMENDING_NON_USERS ??= 'true';
