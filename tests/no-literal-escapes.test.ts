import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * No `\uXXXX` escapes sitting in JSX.
 *
 * JSX attribute values and text are not JavaScript string literals, so an
 * escape sequence written in them is not decoded — it renders as the six
 * characters a user can read. It shipped: a verified badge on the home page
 * showed `✓ Verified member` instead of a tick, along with a literal
 * `→` where an arrow belonged and a `·` where a separator did.
 *
 * Nothing caught it. TypeScript is happy, the linter is happy, the copy lives
 * in the component rather than in messages/ so the translation tests never see
 * it, and the contrast audit measures colours rather than glyphs. It is only
 * visible by looking, which is a poor place for the last line of defence.
 *
 * The rule is blunt on purpose: a real tick, arrow or middle dot is a
 * character these files can hold directly — they are UTF-8 — so there is no
 * legitimate reason to spell one out. If a genuine need ever arises (a control
 * character, say), write it in a `.ts` module and import it.
 */

const SOURCE = join(process.cwd(), 'src');
const ESCAPE = /\\u[0-9a-fA-F]{4}/;

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

describe('JSX source', () => {
  it('spells characters out as characters, not as escape sequences', () => {
    const offenders: string[] = [];

    for (const file of tsxFiles(SOURCE)) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        if (ESCAPE.test(line)) {
          offenders.push(`${file.replace(process.cwd() + '/', '')}:${index + 1}  ${line.trim()}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});
