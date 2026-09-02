import { GradientBackground, type GradientStops } from '@/components/ui/almoayyed';

/**
 * The Almoayyed recipe re-cut in the app's green.
 *
 * The stop positions, falloffs and grain are the original — that geometry is
 * what makes it look hand-finished rather than like a CSS gradient. Only the
 * four colours move, from the source's plum to the greens the rest of the
 * palette is built on, so the accent belongs to the ground instead of sitting
 * on a wash from a different family.
 */
const KOODE_GREEN: GradientStops = {
  base: '#D5D7D5',
  a: '#052718',
  b: '#06301C',
  highlight: '#FFFFFF',
};

/**
 * The app's ground: the Almoayyed gradient, veiled to a legible range.
 *
 * The gradient on its own spans #FFFFFF through #D7D5D5 down to a near-black
 * green (#052718). That range is the problem: this app's text is ink on a light
 * ground, and measured against the raw gradient, body text lands anywhere
 * between 18:1 and 1.04:1 depending on where on the page it happens to sit.
 * Since the layer is fixed, scrolling changes which text sits over which
 * region, so the contrast is not merely low — it is non-deterministic.
 *
 * The veil solves that by clamping the range. It is not a taste value:
 *
 *   - Rendered at 0.88, which puts the darkest reachable ground at #e1e5e3.
 *   - The `--color-paper` token is set to #dce1df, from a 0.86 veil — very
 *     slightly DARKER than anything this actually paints. Every contrast pair
 *     in the app is measured against that token, so each one is checked
 *     against a ground a little worse than the real one. The grain pass below
 *     can then darken a pixel or two without invalidating the measurement.
 *
 * A lighter veil shows more of the gradient, so 0.88 is the most gradient that
 * survives the legibility floor rather than an arbitrary choice — the working
 * was: no veil alpha at all rescues the mid-tone tokens, which is why the
 * palette moved with it.
 */
export function AppBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10">
      <GradientBackground className="absolute inset-0" stops={KOODE_GREEN} />

      {/* The measured veil. Everything above this line is decoration; this
          line is what keeps the page readable. */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(255, 255, 255, 0.88)' }}
      />

      {/*
        Grain, re-laid above the veil.
        The gradient ships its own grain, but under an 88% veil it is gone, and
        the grain is half of what makes this palette look like a printed
        surface rather than a CSS gradient. Kept faint, and `overlay` on a light
        ground lightens far more than it darkens — the headroom described above
        covers what little it takes away.
      */}
      <svg
        aria-hidden="true"
        className="absolute inset-0 size-full"
        style={{ opacity: 0.16, mixBlendMode: 'overlay' }}
      >
        <filter id="app-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.8"
            numOctaves="2"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#app-grain)" />
      </svg>
    </div>
  );
}
