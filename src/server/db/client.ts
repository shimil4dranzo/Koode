import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { env } from '@/server/env';
import { parseMysqlUrl } from '@/server/db/connection-url';

/**
 * Prisma 7 connects through a driver adapter rather than a bundled Rust
 * engine, so the pool is configured here rather than in schema.prisma.
 *
 * Type mapping (DECIMAL, BIGINT) is left entirely to the adapter. Overriding
 * the driver's own conversions would break Prisma's typed results — in
 * particular BIGINT must stay a JavaScript BigInt, because BigInt throws on
 * JSON.stringify and that turns "leaked an internal primary key" from a silent
 * disclosure into a loud crash.
 *
 * In development Next.js re-evaluates modules on every edit; without the
 * global cache each reload would open a fresh pool and exhaust MySQL's
 * connection limit within minutes.
 */

function createClient(): PrismaClient {
  const { host, port, user, password, database } = parseMysqlUrl(env.DATABASE_URL);

  const adapter = new PrismaMariaDb({
    host,
    port,
    user,
    password,
    database,
    connectionLimit: env.NODE_ENV === 'production' ? 10 : 5,
    // Store and compare in UTC everywhere; IST is applied when rendering.
    timezone: 'Z',
    // Fail fast rather than hanging a request on a dead database.
    connectTimeout: 10_000,
    acquireTimeout: 10_000,
  });

  return new PrismaClient({
    adapter,
    log:
      env.NODE_ENV === 'development'
        ? [
            { emit: 'stdout', level: 'warn' },
            { emit: 'stdout', level: 'error' },
          ]
        : [{ emit: 'stdout', level: 'error' }],
  });
}

const globalForPrisma = globalThis as unknown as { koodePrisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.koodePrisma ?? createClient();

if (env.NODE_ENV !== 'production') {
  globalForPrisma.koodePrisma = prisma;
}

/**
 * Anything that can run either standalone or inside `prisma.$transaction`.
 * Services take this rather than PrismaClient so a caller can compose them
 * into one transaction.
 */
export type Db = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;
