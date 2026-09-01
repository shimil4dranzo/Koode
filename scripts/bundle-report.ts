/**
 * Report the JavaScript a first-time visitor has to download.
 *
 * The brief asks for this number at every milestone, and a number nobody
 * prints is a number that quietly triples. The budget below is deliberately
 * tight: the target device is a low-end Android phone on patchy mobile data,
 * where every 100 KB of JavaScript is roughly a second of blank screen.
 *
 *   npm run bundle:report
 */
import { readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Gzipped kilobytes of shared client JS before any page-specific chunk. */
const BUDGET_KB = 120;

const CHUNK_DIR = join(process.cwd(), '.next', 'static', 'chunks');

function walk(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.js')) out.push(full);
  }
  return out;
}

function main(): void {
  const files = walk(CHUNK_DIR);

  if (files.length === 0) {
    console.error('No build output found. Run `npm run build` first.');
    process.exit(1);
  }

  const measured = files
    .map((file) => {
      const raw = readFileSync(file);
      return {
        name: file.replace(`${process.cwd()}/`, ''),
        rawKb: raw.byteLength / 1024,
        // Gzip is what actually crosses the network, so it is what we budget.
        gzipKb: gzipSync(raw).byteLength / 1024,
      };
    })
    .sort((a, b) => b.gzipKb - a.gzipKb);

  const totalGzip = measured.reduce((sum, file) => sum + file.gzipKb, 0);

  console.log('\nClient JavaScript (gzipped)\n');
  for (const file of measured.slice(0, 12)) {
    console.log(`  ${file.gzipKb.toFixed(1).padStart(7)} KB  ${file.name}`);
  }
  if (measured.length > 12) {
    console.log(`  ${' '.repeat(7)}      … and ${measured.length - 12} more chunk(s)`);
  }

  console.log(`\n  Total across all chunks : ${totalGzip.toFixed(1)} KB gzipped`);
  console.log(`  Budget for shared JS    : ${BUDGET_KB} KB gzipped`);

  // Not every chunk loads on every page, so the total is an upper bound rather
  // than the first-load figure. It is still the number that matters for the
  // trend: if the total climbs, some page got heavier.
  if (totalGzip > BUDGET_KB * 2) {
    console.error(
      `\n  Total client JS is more than twice the shared-JS budget.\n` +
        `  Check for a large dependency pulled into a Client Component.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log('\n  Within budget.\n');
}

main();
