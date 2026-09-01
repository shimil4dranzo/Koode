import { cn } from '@/lib/cn';

/**
 * Illustrations.
 *
 * Hand-drawn inline SVG, in the same visual language as the icon set and the
 * logo: a single stroke weight, rounded joins, no fills except where a shape
 * needs to read as solid. Everything inherits `currentColor`, so a caller
 * picks the tone with a text class and both themes work without a second
 * asset.
 *
 * Line art rather than photography on purpose. A stock photo of an office in
 * another country would say the opposite of what this product is; a drawn
 * Edakkara street says where it belongs, weighs a couple of kilobytes, stays
 * crisp on a cheap screen, and needs no image pipeline. All decorative, so
 * every root is aria-hidden.
 */

/**
 * A small-town street: shopfronts under awnings, coconut palms, hills behind.
 *
 * Deliberately generic-Kerala rather than a portrait of one building — it is
 * a backdrop, and a recognisable real shopfront would be somebody's property.
 */
export function TownscapeArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1200 220"
      // Fills the width and crops from the sides on narrow screens, so the
      // shopfronts stay centred instead of squashing.
      preserveAspectRatio="xMidYMax slice"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn('h-auto', className)}
    >
      {/* hills */}
      <path d="M-20 150c70-46 132-46 196 0" opacity={0.45} />
      <path d="M120 152c86-58 162-58 244 0" opacity={0.35} />
      <path d="M980 150c72-48 138-48 240 0" opacity={0.45} />

      {/* left palm */}
      <g>
        <path d="M148 210c2-40 6-66 14-92" />
        <path d="M162 120c-16-14-34-19-52-13" />
        <path d="M162 120c-10-19-24-31-43-35" />
        <path d="M162 120c16-13 34-17 52-10" />
        <path d="M162 120c8-19 21-32 40-37" />
        <path d="M162 119c1-16 6-29 15-40" />
      </g>

      {/* shop row */}
      <g>
        {/* shop 1 */}
        <path d="M250 210v-74h132v74" />
        <path d="M238 136h156l-18-26H256Z" />
        <path d="M276 210v-44h34v44" />
        <path d="M340 168h26v20h-26Z" />

        {/* shop 2, taller */}
        <path d="M402 210v-98h150v98" />
        <path d="M390 112h174l-20-28H410Z" />
        <path d="M428 210v-52h40v52" />
        <path d="M496 158h34v26h-34Z" />
        <path d="M414 136h126" opacity={0.5} />

        {/* shop 3 */}
        <path d="M572 210v-80h124v80" />
        <path d="M560 130h148l-18-24H578Z" />
        <path d="M596 210v-46h30v46" />
        <path d="M652 162h28v22h-28Z" />

        {/* shop 4, with a small upper floor */}
        <path d="M716 210v-116h140v116" />
        <path d="M704 94h164l-20-26H724Z" />
        <path d="M742 210v-54h42v54" />
        <path d="M806 156h32v26h-32Z" />
        <path d="M730 128h112" opacity={0.5} />
      </g>

      {/* right palm, taller */}
      <g>
        <path d="M932 210c3-52 8-84 18-118" />
        <path d="M950 92c-18-16-38-21-58-14" />
        <path d="M950 92c-11-21-27-34-48-39" />
        <path d="M950 92c18-15 38-19 58-11" />
        <path d="M950 92c9-21 24-35 45-41" />
      </g>

      {/* ground */}
      <path d="M0 210h1200" opacity={0.6} />
    </svg>
  );
}

/**
 * The product in one picture: two people, and a third vouching for them.
 *
 * The check-marked link is the whole idea — a recommendation is an edge with
 * a name on it, not a score.
 */
export function VouchNetworkArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 160"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn('h-auto', className)}
    >
      {/* edges, drawn first so the nodes sit on top */}
      <path d="M70 62 118 96" opacity={0.55} />
      <path d="M170 62 122 96" opacity={0.55} />

      {/* referrer, upper left */}
      <g>
        <circle cx="60" cy="46" r="15" />
        <circle cx="60" cy="41" r="6" />
        <path d="M49 55a12 12 0 0 1 22 0" />
      </g>

      {/* employer, upper right */}
      <g>
        <circle cx="180" cy="46" r="15" />
        <circle cx="180" cy="41" r="6" />
        <path d="M169 55a12 12 0 0 1 22 0" />
      </g>

      {/* the vouch itself */}
      <g>
        <rect x="86" y="96" width="68" height="44" rx="10" />
        <path d="M104 118l8 8 16-16" />
      </g>
    </svg>
  );
}
