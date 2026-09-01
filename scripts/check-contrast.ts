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

/** Kept in step with the @theme block in src/app/globals.css. */
const TOKENS: Record<string, Rgb> = {
  'ink-900': oklchToSrgb(0.19, 0.012, 250),
  'ink-700': oklchToSrgb(0.36, 0.014, 250),
  'ink-500': oklchToSrgb(0.53, 0.014, 250),
  'ink-300': oklchToSrgb(0.66, 0.012, 250),
  'ink-200': oklchToSrgb(0.8, 0.008, 250),
  'ink-100': oklchToSrgb(0.94, 0.005, 250),
  paper: oklchToSrgb(0.965, 0.004, 95),
  'paper-raised': oklchToSrgb(1, 0, 0),
  white: { r: 1, g: 1, b: 1 },
  'brand-700': oklchToSrgb(0.42, 0.11, 155),
  'brand-600': oklchToSrgb(0.5, 0.13, 155),
  'brand-500': oklchToSrgb(0.58, 0.14, 155),
  'brand-100': oklchToSrgb(0.94, 0.03, 155),
  'verify-600': oklchToSrgb(0.52, 0.13, 250),
  'verify-100': oklchToSrgb(0.95, 0.03, 250),
  'warn-600': oklchToSrgb(0.53, 0.15, 65),
  'warn-100': oklchToSrgb(0.95, 0.05, 65),
  'danger-600': oklchToSrgb(0.53, 0.19, 25),
  'danger-100': oklchToSrgb(0.95, 0.04, 25),
};

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
  { fg: 'ink-200', bg: 'paper', where: 'card border', kind: 'decor' },
  { fg: 'paper-raised', bg: 'paper', where: 'card surface lift', kind: 'decor' },

  { fg: 'white', bg: 'brand-600', where: 'primary button label', kind: 'text' },
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
