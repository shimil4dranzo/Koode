/**
 * Prisma emits `COLLATE utf8mb4_unicode_ci` for MySQL and offers no way to
 * configure it. Koode requires `utf8mb4_0900_ai_ci` (see ARCHITECTURE.md
 * §Charset) — the MySQL 8 collation built on Unicode 9, which orders and
 * compares Malayalam correctly.
 *
 * Run after every `prisma migrate dev`:      npm run db:normalize
 * CI runs the same script in check mode:     npm run db:normalize -- --check
 *
 * The check mode is the part that matters. It fails the build if a migration
 * ever lands with the wrong collation, which is the only way this stays true
 * three years from now.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'prisma', 'migrations');
const REQUIRED_COLLATION = 'utf8mb4_0900_ai_ci';
const REQUIRED_CHARSET = 'utf8mb4';

/** Collations Prisma or a hand-written migration might wrongly introduce. */
const WRONG_COLLATION = /utf8mb4_(unicode|general|bin|0900_as_cs)_?c?i?/g;
/** MySQL's legacy 3-byte "utf8", which cannot store every Malayalam codepoint. */
const LEGACY_CHARSET = /CHARACTER SET utf8\b(?!mb4)/g;

function migrationFiles(): string[] {
  let entries: string[];
  try {
    entries = readdirSync(MIGRATIONS_DIR);
  } catch {
    return [];
  }
  return entries
    .filter((name) => statSync(join(MIGRATIONS_DIR, name)).isDirectory())
    .map((name) => join(MIGRATIONS_DIR, name, 'migration.sql'))
    .filter((file) => {
      try {
        return statSync(file).isFile();
      } catch {
        return false;
      }
    });
}

function main(): void {
  const checkOnly = process.argv.includes('--check');
  const files = migrationFiles();

  if (files.length === 0) {
    console.log('normalize-migrations: no migrations found, nothing to do.');
    return;
  }

  const offenders: string[] = [];
  let rewritten = 0;

  for (const file of files) {
    const original = readFileSync(file, 'utf8');

    if (LEGACY_CHARSET.test(original)) {
      LEGACY_CHARSET.lastIndex = 0;
      offenders.push(`${file}: uses MySQL legacy 3-byte "utf8" — must be ${REQUIRED_CHARSET}`);
      continue;
    }
    LEGACY_CHARSET.lastIndex = 0;

    const next = original.replace(WRONG_COLLATION, REQUIRED_COLLATION);
    if (next === original) continue;

    if (checkOnly) {
      offenders.push(`${file}: collation is not ${REQUIRED_COLLATION}`);
    } else {
      writeFileSync(file, next, 'utf8');
      rewritten += 1;
      console.log(`normalize-migrations: rewrote ${file}`);
    }
  }

  if (offenders.length > 0) {
    console.error('\nMigration charset/collation check FAILED:\n');
    for (const line of offenders) console.error(`  - ${line}`);
    console.error(
      `\nFix by running: npm run db:normalize\n` +
        `Malayalam text depends on ${REQUIRED_CHARSET}/${REQUIRED_COLLATION}.\n`,
    );
    process.exit(1);
  }

  console.log(
    checkOnly
      ? `normalize-migrations: ${files.length} migration(s) OK (${REQUIRED_COLLATION}).`
      : `normalize-migrations: ${rewritten} file(s) rewritten, ${files.length} checked.`,
  );
}

main();
