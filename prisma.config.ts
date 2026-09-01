import './scripts/load-env.ts';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 moved the datasource URL out of schema.prisma and into this file.
 *
 * The URL is read from the environment and never written here literally. If
 * DATABASE_URL is missing, the CLI fails loudly rather than silently pointing
 * at a default database.
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
