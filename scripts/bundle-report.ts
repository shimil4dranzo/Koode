/**
 * Report the JavaScript a first-time visitor has to download.
 *
 * The brief asks for this number at every milestone, and a number nobody
 * prints is a number that quietly triples. The budget below is deliberately
 * tight: the target device is a low-end Android phone on patchy mobile data,
 * where every 100 KB of JavaScript is roughly a second of blank screen.
 *
 * The report separates three things that a single summed total would blur:
 *
 *   - SHARED chunks, downloaded on every route by every visitor. This is the
 *     only figure with a hard budget, because it is the only one that every
 *     single person pays.
 *   - PER-ROUTE chunks. Listed but never summed: nobody loads the admin page
 *     and the sign-in page at once, so their total describes no real visitor.
 *     The useful number is the shell plus the heaviest single route.
 *   - LAZY chunks, behind a `next/dynamic` import, downloaded only if the code
 *     asks for them.
 *
 * That distinction is not a nicety. The 3D graph pulls in three.js, which is
 * larger than the entire rest of the app; counted as first-load it would keep
 * this check permanently red, and a check that cries wolf is one people learn
 * to ignore. Lazy chunks still get a (looser) ceiling, because "it is lazy" is
 * not a licence for it to be unbounded.
 *
 *   npm run bundle:report
 */
import { readdirSync, statSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Gzipped kilobytes of SHARED client JS — the chunks every visitor downloads
 * on every route.
 *
 * 140 rather than a rounder, more flattering number because roughly 127 KB of
 * it is React DOM plus the Next runtime and router, which no amount of care in
 * this codebase removes. Budgeting below the framework floor would produce a
 * check that can never pass; budgeting far above it produces one that never
 * fires. This leaves about 13 KB of headroom, so the check has one job: shout
 * if a heavy dependency lands in the shared shell.
 */
const SHARED_BUDGET_KB = 140;

/**
 * Ceiling for any single on-demand chunk. Loose, because this code only ever
 * reaches a device that already passed the capability checks — but present,
 * so a lazy import cannot become a dumping ground.
 */
const LAZY_CHUNK_CEILING_KB = 200;

const NEXT_DIR = join(process.cwd(), '.next');
const CHUNK_DIR = join(NEXT_DIR, 'static', 'chunks');

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

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}

/**
 * Every chunk Next records as reachable only through a dynamic import.
 *
 * Next writes one `react-loadable-manifest.json` per route, listing the chunks
 * behind each `next/dynamic` call in that route. Reading them is far more
 * reliable than guessing from filenames, which are content hashes.
 */
function findLazyChunks(): Set<string> {
  const lazy = new Set<string>();
  const serverDir = join(NEXT_DIR, 'server');
  if (!existsSync(serverDir)) return lazy;

  const stack = [serverDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (dir === undefined) break;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        stack.push(full);
      } else if (entry === 'react-loadable-manifest.json') {
        const manifest = readJson(full);
        if (manifest === undefined || manifest === null) continue;
        for (const value of Object.values(manifest as Record<string, unknown>)) {
          const files = (value as { files?: unknown })?.files;
          if (!Array.isArray(files)) continue;
          for (const file of files) {
            if (typeof file === 'string') lazy.add(file);
          }
        }
      }
    }
  }
  return lazy;
}

type Measured = { name: string; key: string; gzipKb: number };

function main(): void {
  const files = walk(CHUNK_DIR);

  if (files.length === 0) {
    console.error('No build output found. Run `npm run build` first.');
    process.exit(1);
  }

  const lazyChunks = findLazyChunks();

  const measured: Measured[] = files
    .map((file) => {
      const raw = readFileSync(file);
      // Manifests name chunks relative to `.next/`, so match on that form.
      const key = relative(NEXT_DIR, file);
      return {
        name: relative(process.cwd(), file),
        key,
        // Gzip is what actually crosses the network, so it is what we budget.
        gzipKb: gzipSync(raw).byteLength / 1024,
      };
    })
    .sort((a, b) => b.gzipKb - a.gzipKb);

  // The shared shell, named by the build manifest. Every route loads these.
  const rootManifest = readJson(join(NEXT_DIR, 'build-manifest.json')) as
    | { rootMainFiles?: unknown }
    | undefined;
  const sharedKeys = new Set(
    (Array.isArray(rootManifest?.rootMainFiles) ? rootManifest.rootMainFiles : [])
      .filter((f): f is string => typeof f === 'string')
      .map((f) => f.split('/').join(sep)),
  );

  const shared = measured.filter((file) => sharedKeys.has(file.key));
  const lazy = measured.filter((file) => lazyChunks.has(file.key));
  // Everything else: per-route code. Listed, but never summed into a single
  // figure — no visitor loads the admin page and the sign-in page at once, so
  // that sum would describe nobody.
  const perRoute = measured.filter(
    (file) => !sharedKeys.has(file.key) && !lazyChunks.has(file.key),
  );

  const sharedTotal = shared.reduce((sum, file) => sum + file.gzipKb, 0);

  const show = (file: Measured) =>
    console.log(`  ${file.gzipKb.toFixed(1).padStart(7)} KB  ${file.name}`);

  console.log('\nShared shell — every visitor, every route (gzipped)\n');
  shared.forEach(show);
  console.log(`\n  Total  : ${sharedTotal.toFixed(1)} KB gzipped`);
  console.log(`  Budget : ${SHARED_BUDGET_KB} KB gzipped  (~127 KB of it is React + Next)`);

  if (perRoute.length > 0) {
    const heaviest = perRoute[0];
    console.log('\nPer route — one of these, not all (gzipped)\n');
    perRoute.slice(0, 6).forEach(show);
    if (perRoute.length > 6) {
      console.log(`  ${' '.repeat(7)}      … and ${perRoute.length - 6} more route chunk(s)`);
    }
    if (heaviest !== undefined) {
      console.log(
        `\n  Worst case for a single page: ${(sharedTotal + heaviest.gzipKb).toFixed(1)} KB` +
          ` (shell + heaviest route).`,
      );
    }
  }

  if (lazy.length > 0) {
    console.log('\nOn demand — only if the page asks for it (gzipped)\n');
    lazy.forEach(show);
    console.log('\n  Not counted against the first-load budget: a visitor who');
    console.log('  never triggers the dynamic import never downloads these.');
  }

  const oversizedLazy = lazy.filter((file) => file.gzipKb > LAZY_CHUNK_CEILING_KB);

  let failed = false;

  if (sharedTotal > SHARED_BUDGET_KB) {
    console.error(
      `\n  SHARED SHELL OVER BUDGET by ${(sharedTotal - SHARED_BUDGET_KB).toFixed(1)} KB.\n` +
        `  Check for a large dependency pulled into a Client Component;\n` +
        `  if it is genuinely optional, load it with next/dynamic instead.`,
    );
    failed = true;
  }

  for (const file of oversizedLazy) {
    console.error(
      `\n  Lazy chunk ${file.name} is ${file.gzipKb.toFixed(1)} KB,\n` +
        `  over the ${LAZY_CHUNK_CEILING_KB} KB ceiling for a single on-demand chunk.`,
    );
    failed = true;
  }

  if (failed) {
    process.exitCode = 1;
    return;
  }

  console.log('\n  Within budget.\n');
}

main();
