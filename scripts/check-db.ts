/**
 * Verify that the database actually stores Malayalam, and report the settings
 * that differ between a developer's machine and a Linux server.
 *
 * Run after `npm run db:deploy`:   npm run db:check
 *
 * This is not a formality. MySQL's legacy 3-byte `utf8` accepts Malayalam text
 * and silently mangles it, and the damage is only visible once a real user
 * reads the page. Checking with an English placeholder would prove nothing,
 * so this writes and reads back real Malayalam.
 */
import './load-env.ts';
import mariadb from 'mariadb';
import { parseMysqlUrl } from '../src/server/db/connection-url.ts';

const SAMPLES = [
  'എടക്കര', // Edakkara — the town
  'കൂടെ', // the product name
  'ഇലക്ട്രീഷ്യൻ', // a chillu + conjunct, the shapes that break first
  'ചാർട്ടേഡ് അക്കൗണ്ടന്റ്', // chartered accountant
  'ജോലി ഒഴിവുകൾ 🙂', // a 4-byte emoji, which 3-byte utf8 cannot store at all
];

type Row = Record<string, string | number | null>;

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env.local first.');
    process.exit(1);
  }

  const config = parseMysqlUrl(url);
  const connection = await mariadb.createConnection({ ...config, charset: 'utf8mb4' });

  let failed = false;

  try {
    const [version] = (await connection.query('SELECT VERSION() AS v')) as Row[];
    console.log(`MySQL version              : ${version?.v}`);

    // --- Identifier case sensitivity ---------------------------------------
    // 0 = names stored as written, compared case-sensitively (Linux default)
    // 1 = names lower-cased on storage (Windows, and the usual macOS default)
    // 2 = names stored as written, compared case-insensitively (macOS)
    const [lctn] = (await connection.query(
      "SHOW VARIABLES LIKE 'lower_case_table_names'",
    )) as Row[];
    const lctnValue = String(lctn?.Value ?? '?');
    console.log(`lower_case_table_names     : ${lctnValue}`);
    if (lctnValue !== '0') {
      console.warn(
        `  WARNING: this server is ${lctnValue}, a Linux server defaults to 0.\n` +
          `  The schema name "Koode" is capitalised, so a mismatch here is the\n` +
          `  classic works-on-my-machine failure. See ARCHITECTURE.md.`,
      );
    }

    // --- Charset and collation ---------------------------------------------
    const [dbCharset] = (await connection.query(
      `SELECT DEFAULT_CHARACTER_SET_NAME AS charset, DEFAULT_COLLATION_NAME AS collation
         FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?`,
      [config.database],
    )) as Row[];

    console.log(`Database charset           : ${dbCharset?.charset}`);
    console.log(`Database collation         : ${dbCharset?.collation}`);

    if (dbCharset?.charset !== 'utf8mb4') {
      console.error(
        `  FAIL: charset is "${dbCharset?.charset}", expected utf8mb4.\n` +
          `  Malayalam will be corrupted. Do not work around this — see §8.6 of the brief.`,
      );
      failed = true;
    }
    if (dbCharset?.collation !== 'utf8mb4_0900_ai_ci') {
      console.error(
        `  FAIL: collation is "${dbCharset?.collation}", expected utf8mb4_0900_ai_ci.`,
      );
      failed = true;
    }

    // Any table that slipped through with the wrong collation.
    //
    // `_prisma_migrations` is excluded: the Prisma CLI creates it with its own
    // hardcoded collation, it holds nothing but ASCII migration names and
    // checksums, and we cannot change it. Failing on a table we do not own and
    // that carries no user data would be a standing false alarm, and a check
    // that cries wolf is one people learn to ignore.
    const badTables = (await connection.query(
      `SELECT TABLE_NAME AS name, TABLE_COLLATION AS collation
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME <> '_prisma_migrations'
          AND TABLE_COLLATION <> 'utf8mb4_0900_ai_ci'`,
      [config.database],
    )) as Row[];

    if (badTables.length > 0) {
      console.error('  FAIL: tables with the wrong collation:');
      for (const table of badTables) {
        console.error(`    - ${table.name}: ${table.collation}`);
      }
      failed = true;
    }

    // --- Round trip real Malayalam -----------------------------------------
    await connection.query('DROP TEMPORARY TABLE IF EXISTS koode_charset_probe');
    await connection.query(
      `CREATE TEMPORARY TABLE koode_charset_probe (
         id INT AUTO_INCREMENT PRIMARY KEY,
         value VARCHAR(191) NOT NULL
       ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
    );

    for (const sample of SAMPLES) {
      await connection.query('INSERT INTO koode_charset_probe (value) VALUES (?)', [sample]);
    }

    const rows = (await connection.query(
      'SELECT value FROM koode_charset_probe ORDER BY id',
    )) as Row[];

    console.log('\nMalayalam round trip:');
    for (const [index, sample] of SAMPLES.entries()) {
      const returned = String(rows[index]?.value ?? '');
      const okay = returned === sample;
      console.log(`  ${okay ? 'ok  ' : 'FAIL'} ${sample}${okay ? '' : ` -> got "${returned}"`}`);
      if (!okay) failed = true;
    }

    await connection.query('DROP TEMPORARY TABLE koode_charset_probe');
  } finally {
    await connection.end();
  }

  if (failed) {
    console.error('\nDatabase check FAILED. Do not seed or migrate further until this is fixed.');
    process.exit(1);
  }

  console.log('\nDatabase check passed.');
}

main().catch((error: unknown) => {
  console.error('Database check could not run:', error instanceof Error ? error.message : error);
  process.exit(1);
});
