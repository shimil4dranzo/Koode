/**
 * Measure the WCAG contrast ratio of every colour pair the UI actually uses.
 *
 * The palette is authored in OKLCH, which is good for picking colours and
 * useless for judging contrast by eye — two swatches with the same lightness
 * value can land either side of 4.5:1 depending on hue and chroma. So this
 * converts to sRGB and computes the real ratio.
 *
 *   npm run check:contrast
 *
 * Run it after touching the palette in src/app/globals.css. The pairs listed
 * below are the ones that appear in components; adding a new pair to the UI
 * means adding it here.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Rgb = { r: number; g: number; b: number };

/** OKLCH → linear sRGB → gamma-encoded sRGB (Björn Ottosson's transform). */
function oklchToSrgb(L: number, C: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const bb = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * bb;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * bb;
  const s_ = L - 0.0894841775 * a - 1.291485548 * bb;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  const encode = (v: number): number => {
    const clamped = Math.max(0, Math.min(1, v));
    return clamped <= 0.0031308
      ? 12.92 * clamped
      : 1.055 * clamped ** (1 / 2.4) - 0.055;
  };

  return { r: encode(lr), g: encode(lg), b: encode(lb) };
}

/** WCAG 2.1 relative luminance. */
function luminance({ r, g, b }: Rgb): number {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

function hex({ r, g, b }: Rgb): string {
  const c = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/**
 * The palette, read straight out of the stylesheet.
 *
 * This used to be a hand-copied table with a comment asking the next person to
 * keep it in step. That is a contrast checker whose failure mode is measuring
 * colours the app does not actually use — it would keep reporting "all pass"
 * against stale values while the real UI drifted. Parsing the source of truth
 * removes the possibility.
 */
const TOKENS: Record<string, Rgb> = (() => {
  const css = readFileSync(
    join(process.cwd(), 'src', 'app', 'globals.css'),
    'utf8',
  );

  const tokens: Record<string, Rgb> = {
    // Not a token: the literal white used for text on coloured grounds.
    white: { r: 1, g: 1, b: 1 },
  };

  // --color-<name>: oklch(<L> <C> <H>);
  const oklchPattern =
    /--color-([a-z0-9-]+):\s*oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/g;

  for (const match of css.matchAll(oklchPattern)) {
    const [, name, l, c, h] = match;
    if (name === undefined || l === undefined || c === undefined || h === undefined) {
      continue;
    }
    tokens[name] = oklchToSrgb(Number(l), Number(c), Number(h));
  }

  // --color-<name>: #rrggbb;
  // `paper` is written as a hex literal because it is not a colour anyone
  // chose on a perceptual scale — it is the measured darkest point of the
  // gradient ground, and rounding it through OKLCH would move the very number
  // the rest of this check depends on.
  const hexPattern = /--color-([a-z0-9-]+):\s*#([0-9a-fA-F]{6})\b/g;
  for (const match of css.matchAll(hexPattern)) {
    const [, name, value] = match;
    if (name === undefined || value === undefined) continue;
    tokens[name] = {
      r: Number.parseInt(value.slice(0, 2), 16) / 255,
      g: Number.parseInt(value.slice(2, 4), 16) / 255,
      b: Number.parseInt(value.slice(4, 6), 16) / 255,
    };
  }

  if (Object.keys(tokens).length < 5) {
    throw new Error(
      'Parsed almost no colour tokens from globals.css — the @theme block or ' +
        'the oklch() syntax has changed, and this check is now measuring nothing.',
    );
  }

  return tokens;
})();

type Pair = {
  fg: keyof typeof TOKENS;
  bg: keyof typeof TOKENS;
  where: string;
  /**
   * 'text'  — body copy, 4.5:1 (WCAG 1.4.3)
   * 'large' — 18.66px bold / 24px, 3:1
   * 'ui'    — anything that identifies a CONTROL or its state, 3:1 (WCAG 1.4.11)
   * 'decor' — a non-interactive container edge or surface lift. WCAG sets no
   *           requirement here, and inventing one would just push every card
   *           toward looking like a wireframe. These are MEASURED AND REPORTED
   *           so a designer can judge them, but they do not fail the build.
   *           Card separation is carried by the border and the surface lift
   *           together, not by either alone.
   */
  kind: 'text' | 'large' | 'ui' | 'decor';
};

const PAIRS: Pair[] = [
  { fg: 'ink-900', bg: 'paper', where: 'body text', kind: 'text' },
  { fg: 'ink-900', bg: 'paper-raised', where: 'body text on a card', kind: 'text' },
  { fg: 'ink-700', bg: 'paper', where: 'secondary text', kind: 'text' },
  { fg: 'ink-700', bg: 'paper-raised', where: 'secondary text on a card', kind: 'text' },
  { fg: 'ink-700', bg: 'ink-100', where: 'text on the consent panel', kind: 'text' },
  { fg: 'ink-500', bg: 'paper', where: 'tertiary text / captions', kind: 'text' },
  { fg: 'ink-500', bg: 'paper-raised', where: 'field placeholder', kind: 'text' },
  { fg: 'ink-300', bg: 'paper-raised', where: 'input border', kind: 'ui' },
  { fg: 'ink-300', bg: 'paper', where: 'chip border / switch track on the page ground', kind: 'ui' },
  { fg: 'ink-200', bg: 'paper', where: 'card border', kind: 'decor' },
  { fg: 'paper-raised', bg: 'paper', where: 'card surface lift', kind: 'decor' },

  // The hero band. Its whole reason for being dark is that the WebGL graph
  // needs a dark ground, so every pairing on it is measured rather than
  // assumed — light text on dark is easy to get subtly wrong.
  // The wordmark and the display type it sets the tone for.
  { fg: 'navy-900', bg: 'paper', where: 'wordmark / display heading', kind: 'text' },
  { fg: 'navy-900', bg: 'paper-raised', where: 'wordmark on a card', kind: 'text' },
  { fg: 'white', bg: 'navy-900', where: 'inverse wordmark / dark band', kind: 'text' },
  { fg: 'navy-100', bg: 'navy-900', where: 'secondary text on a navy band', kind: 'text' },
  { fg: 'brand-500', bg: 'navy-900', where: 'the smile on a dark ground', kind: 'ui' },

  { fg: 'white', bg: 'navy-800', where: 'step title on the navy band', kind: 'text' },
  { fg: 'navy-100', bg: 'navy-800', where: 'step body on the navy band', kind: 'text' },
  { fg: 'navy-900', bg: 'brand-500', where: 'step number on its badge', kind: 'text' },

  { fg: 'white', bg: 'night-900', where: 'hero headline', kind: 'text' },
  { fg: 'night-300', bg: 'night-900', where: 'hero body and stat labels', kind: 'text' },
  { fg: 'white', bg: 'night-800', where: 'text on a hero vouch card', kind: 'text' },
  { fg: 'night-300', bg: 'night-800', where: 'attribution on a hero vouch card', kind: 'text' },
  { fg: 'night-900', bg: 'brand-500', where: 'hero primary button label', kind: 'text' },
  { fg: 'brand-500', bg: 'night-900', where: 'hero accent mark', kind: 'ui' },

  { fg: 'white', bg: 'brand-600', where: 'primary button label', kind: 'text' },
  { fg: 'white', bg: 'brand-700', where: 'closing CTA heading on the green band', kind: 'text' },
  { fg: 'brand-100', bg: 'brand-700', where: 'closing CTA body text', kind: 'text' },
  { fg: 'brand-700', bg: 'paper', where: 'link / brand wordmark', kind: 'text' },
  { fg: 'brand-700', bg: 'paper-raised', where: 'link on a card', kind: 'text' },
  { fg: 'brand-700', bg: 'brand-100', where: 'step number badge', kind: 'text' },
  { fg: 'brand-600', bg: 'paper', where: 'brand border', kind: 'ui' },

  { fg: 'verify-600', bg: 'verify-100', where: 'verified-member badge', kind: 'text' },
  { fg: 'verify-600', bg: 'paper', where: 'focus ring', kind: 'ui' },
  { fg: 'warn-600', bg: 'warn-100', where: 'offline banner / warning', kind: 'text' },
  { fg: 'danger-600', bg: 'danger-100', where: 'error message', kind: 'text' },
  { fg: 'danger-600', bg: 'paper-raised', where: 'destructive button label', kind: 'text' },
  { fg: 'danger-600', bg: 'paper', where: 'required-field asterisk', kind: 'ui' },
];

const REQUIRED = { text: 4.5, large: 3, ui: 3 } as const;

/** Kinds that are reported for information rather than enforced. */
const ADVISORY = new Set<Pair['kind']>(['decor']);

function main(): void {
  let failed = 0;
  const rows: string[] = [];

  for (const pair of PAIRS) {
    const fg = TOKENS[pair.fg];
    const bg = TOKENS[pair.bg];
    if (!fg || !bg) throw new Error(`Unknown token in pair: ${pair.fg} / ${pair.bg}`);

    const ratio = contrast(fg, bg);

    if (ADVISORY.has(pair.kind)) {
      rows.push(
        `  --   ${ratio.toFixed(2).padStart(5)}:1 (advisory)   ` +
          `${pair.fg} on ${pair.bg} — ${pair.where}`,
      );
      continue;
    }

    const needed = REQUIRED[pair.kind as keyof typeof REQUIRED];
    const ok = ratio >= needed;
    if (!ok) failed += 1;

    rows.push(
      `  ${ok ? 'ok  ' : 'FAIL'} ${ratio.toFixed(2).padStart(5)}:1 ` +
        `(needs ${needed}) ${pair.fg} on ${pair.bg} — ${pair.where}` +
        (ok ? '' : `\n         ${hex(fg)} on ${hex(bg)}`),
    );
  }

  console.log('\nWCAG contrast, measured from the OKLCH palette\n');
  console.log(rows.join('\n'));

  if (failed > 0) {
    console.error(
      `\n${failed} pair(s) below the required ratio.\n` +
        `These are read outdoors on cheap Android screens — the threshold is a floor, not a target.\n`,
    );
    process.exit(1);
  }

  const enforced = PAIRS.filter((pair) => !ADVISORY.has(pair.kind)).length;
  console.log(`\nAll ${enforced} enforced pairs pass. ${PAIRS.length - enforced} advisory.\n`);
}

main();
