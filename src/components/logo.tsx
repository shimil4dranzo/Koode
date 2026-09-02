import { cn } from '@/lib/cn';

/**
 * The Koode wordmark: "koode" in navy, with a green smile under the two o's.
 *
 * Drawn as geometric paths rather than set in a typeface, for two reasons.
 * A logo must be identical everywhere, and text depends on a font actually
 * arriving — with the system stack this app deliberately uses, the wordmark
 * would render in a different face on Android, iOS and Windows. And the
 * alternative, shipping a display webfont, costs real bytes on the mobile data
 * this product is built around, for five letters.
 *
 * The construction is honest to the mark: a geometric lowercase alphabet is
 * circles and straight lines, so the o's, the d's bowl and the e are true
 * circles of one radius, and the k is three strokes. It scales to any size and
 * costs nothing.
 *
 * The letters use `currentColor` so the mark can sit on light or dark ground;
 * the smile keeps its green in both, because that is the part people recognise.
 *
 * There is deliberately no export for the smile on its own. It was tried as an
 * inline flourish beside a line of text and read as the wordmark with the word
 * missing — a broken logo rather than a decoration. The smile appears either
 * inside the wordmark or inside the tile below, never loose.
 */

/** Geometry shared by the wordmark and the compact mark. */
const SMILE_PATH = 'M56 77 Q101 95 146 77';

export function LogoWordmark({
  className,
  tone = 'brand',
}: {
  className?: string;
  /** `brand` is navy on light ground; `inverse` is white on dark. */
  tone?: 'brand' | 'inverse';
}) {
  return (
    <svg
      viewBox="0 0 272 108"
      role="img"
      aria-label="Koode"
      className={cn(
        'h-auto',
        tone === 'inverse' ? 'text-white' : 'text-navy-900',
        className,
      )}
      fill="none"
      stroke="currentColor"
      strokeWidth={11}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* k — stem, arm, leg */}
      <path d="M16 6v56" />
      <path d="M16 42 40 24" />
      <path d="M26 34 42 62" />

      {/* o o */}
      <circle cx="74" cy="44" r="18" />
      <circle cx="128" cy="44" r="18" />

      {/* d — bowl and ascender */}
      <circle cx="182" cy="44" r="18" />
      <path d="M200 6v56" />

      {/* e — crossbar, then a 225° arc leaving the mouth open at lower right */}
      {/*
        e — crossbar left-to-right, then the bowl counter-clockwise from the
        right terminal all the way round to just below it, leaving the mouth
        open at lower right. The terminal is a real point on the r=18 circle
        (252.7, 56.7); an endpoint even slightly off the radius makes SVG
        scale the arc to reach it, which is what mirrored the glyph first time.
      */}
      <path d="M222 44H258A18 18 0 1 0 252.7 56.7" />

      {/* The smile. Green in both tones, because it is the part people
          recognise — but a step brighter on dark ground, where the darker
          green used on paper sinks into the navy. */}
      <path
        d={SMILE_PATH}
        className={tone === 'inverse' ? 'text-brand-500' : 'text-brand-600'}
        stroke="currentColor"
        strokeWidth={10}
      />
    </svg>
  );
}

/**
 * The compact mark: the smile alone, in a rounded tile.
 *
 * Used where the full wordmark would be illegible — the PWA icon, a favicon,
 * an avatar-sized slot. Derived from the wordmark rather than invented, so the
 * two read as one identity.
 *
 * Decorative by default: wherever this appears the name is written beside it.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-xl bg-navy-900',
        className,
      )}
    >
      <svg
        viewBox="40 60 122 50"
        className="w-[64%] text-brand-500"
        fill="none"
        stroke="currentColor"
        strokeWidth={14}
        strokeLinecap="round"
      >
        <path d={SMILE_PATH} />
      </svg>
    </span>
  );
}
