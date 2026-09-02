/**
 * Measure text contrast on the RENDERED pages, not on the palette.
 *
 * `check:contrast` reads globals.css and checks the colour pairs we declare we
 * use. That is fast and needs no browser, but it can only ever check pairings
 * somebody remembered to list — and the pairing that actually broke the site
 * was one nobody listed, because it did not exist in any source file:
 *
 *   A Card's base class says `bg-paper-raised`. A caller passed
 *   `bg-navy-800/70` alongside it. `cn` does no conflict resolution, so both
 *   were emitted and the cascade picked white. The text on those cards was
 *   `text-white`. Every colour involved was individually correct; the failure
 *   existed only in the browser, at runtime, and shipped.
 *
 * So this walks every visible text element on every page, resolves the colour
 * actually painted behind it by compositing up the ancestor chain, and applies
 * the WCAG threshold for that element's real size and weight.
 *
 * Colours are resolved through a canvas rather than parsed. Tailwind 4 emits
 * oklch(), which browsers report back from getComputedStyle as lab() or
 * color() — a regex written for rgb() silently reports every such background
 * as absent and then measures against white, which makes the audit confidently
 * wrong. The first version of this did exactly that and reported seven
 * failures that did not exist.
 *
 *   npm run audit:contrast              # against localhost:3100
 *   npm run audit:contrast -- <baseUrl>
 */
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://localhost:3100';

/** Every page a visitor can reach without signing in, in both languages. */
const PATHS = [
  'en',
  'en/openings',
  'en/openings/new',
  'en/about',
  'en/sign-in',
  'en/privacy',
  'ml',
  'ml/openings',
  'ml/openings/new',
  'ml/about',
  'ml/sign-in',
];

/** Phone first, because that is what this audience actually holds. */
const VIEWPORTS = [
  { name: 'phone', width: 375, height: 812 },
  { name: 'desktop', width: 1440, height: 900 },
];

type Finding = {
  ratio: number;
  need: number;
  px: number;
  tag: string;
  cls: string;
  text: string;
};

/**
 * The audit, as source text rather than a function reference.
 *
 * It has to be a string. tsx compiles through esbuild, which instruments named
 * functions with a `__name` helper; passing the function to page.evaluate
 * serialises that instrumented form, and the helper does not exist in the
 * browser, so every page fails with "__name is not defined". Handing Playwright
 * an expression sidesteps the compiler entirely.
 *
 * The trade is that TypeScript cannot check the inside of this block, so it is
 * kept small and free of anything clever.
 */
const COLLECT_FINDINGS = `(() => {
  const canvas = document.createElement('canvas');
  canvas.width = 1; canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];

  const toRgba = (css) => {
    if (!css || css === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    ctx.clearRect(0, 0, 1, 1);
    try { ctx.fillStyle = css; } catch (e) { return null; }
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
  };

  const luminance = (c) => {
    const f = (v) => { const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };

  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });

  const ratio = (a, b) => {
    const l1 = luminance(a), l2 = luminance(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };

  const backgroundOf = (start) => {
    let acc = null;
    for (let n = start; n; n = n.parentElement) {
      const c = toRgba(getComputedStyle(n).backgroundColor);
      if (!c || c.a === 0) continue;
      acc = acc ? over(acc, c) : c;
      if (acc.a >= 0.999) return acc;
    }
    const white = { r: 255, g: 255, b: 255, a: 1 };
    return acc ? over(acc, white) : white;
  };

  const findings = [];
  const all = document.querySelectorAll('body *');

  for (let i = 0; i < all.length; i += 1) {
    const el = all[i];
    let text = '';
    for (let j = 0; j < el.childNodes.length; j += 1) {
      const n = el.childNodes[j];
      if (n.nodeType === 3) text += ' ' + (n.textContent || '').trim();
    }
    text = text.trim();
    if (!text) continue;

    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (parseFloat(cs.opacity) < 0.95) continue;

    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;

    const fg = toRgba(cs.color);
    if (!fg || fg.a === 0) continue;

    const bg = backgroundOf(el);
    const effective = fg.a < 1 ? over(fg, bg) : fg;
    const measured = ratio(effective, bg);

    const px = parseFloat(cs.fontSize);
    const bold = (parseInt(cs.fontWeight, 10) || 400) >= 700;
    const need = (px >= 24 || (bold && px >= 18.66)) ? 3 : 4.5;

    if (measured < need) {
      findings.push({
        ratio: Math.round(measured * 100) / 100,
        need: need,
        px: Math.round(px),
        tag: el.tagName,
        cls: String(el.className).slice(0, 48),
        text: text.slice(0, 40),
      });
    }
  }

  return findings.sort((a, b) => a.ratio - b.ratio);
})()`;

async function main(): Promise<void> {
  const browser = await chromium.launch();
  let total = 0;
  let errors = 0;

  try {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      });
      const page = await context.newPage();

      console.log(`\n${viewport.name} — ${viewport.width}x${viewport.height}\n`);

      for (const path of PATHS) {
        try {
          await page.goto(`${BASE}/${path}`, {
            waitUntil: 'networkidle',
            timeout: 30_000,
          });
          // Let the scroll reveals settle, or everything reads as opacity 0.
          await page.waitForTimeout(1200);

          const findings = (await page.evaluate(COLLECT_FINDINGS)) as Finding[];
          total += findings.length;

          const status = findings.length === 0 ? 'ok  ' : 'FAIL';
          console.log(`  ${status} ${String(findings.length).padStart(3)}  /${path}`);
          for (const f of findings.slice(0, 8)) {
            console.log(
              `         ${f.ratio.toFixed(2)}:1 (needs ${f.need}) ${f.px}px ` +
                `<${f.tag}> "${f.text}"`,
            );
            console.log(`             class: ${f.cls}`);
          }
        } catch (error) {
          console.error(`  ERR      /${path}  ${String(error).slice(0, 90)}`);
          errors += 1;
        }
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }

  if (errors > 0) {
    console.error(
      `\n  ${errors} page(s) could not be audited — the result below covers ` +
        `only the pages that loaded.`,
    );
  }

  if (total > 0 || errors > 0) {
    console.error(`  ${total} text element(s) below the contrast floor.\n`);
    process.exitCode = 1;
    return;
  }

  console.log('\n  Every text element on every page clears its threshold.\n');
}

await main();
