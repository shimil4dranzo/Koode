// GradientBackground — "Almoayyed", made with the 21st.dev Gradient
// Builder and exported as live CSS (the builder's own Copy-CSS background,
// plus its soften-blur and grain passes). Zero dependencies: one <div> that
// fills its parent. Drop it behind your content:
// <div className="relative h-96"><GradientBackground className="absolute inset-0" /></div>
// Remix the source recipe (colors, mode, finish) in the editor:
// https://21st.dev/community/gradients/editor?from=dc893a4f-0b29-4732-9b29-d4de9c0b70ee
//
// Local change: the four colour stops are a prop rather than literals, so the
// same recipe — the stop positions, falloffs, blend modes and grain that make
// it look like this — can be re-cut in the app's own palette. ALMOAYYED below
// is the original export, unchanged, and is still the default.

/** The four colours the recipe blends. */
export type GradientStops = {
  /** Ground, and the soft wash at 66.94% 46.43%. */
  base: string;
  /** The larger dark bloom, lower left. */
  a: string;
  /** The smaller dark bloom, upper centre. */
  b: string;
  /** The bright bloom, lower right. */
  highlight: string;
};

/** The recipe exactly as exported from the builder. */
export const ALMOAYYED: GradientStops = {
  base: "#D7D5D5",
  a: "#310527",
  b: "#39051F",
  highlight: "#FFFFFF",
};

/** "#rrggbb" -> "r, g, b", so the stops can go straight into rgba(). */
function channels(hex: string): string {
  const value = hex.replace("#", "")
  const r = Number.parseInt(value.slice(0, 2), 16)
  const g = Number.parseInt(value.slice(2, 4), 16)
  const b = Number.parseInt(value.slice(4, 6), 16)
  return `${r}, ${g}, ${b}`
}

export function GradientBackground({
  className,
  stops = ALMOAYYED,
}: {
  className?: string
  stops?: GradientStops
}) {
  const base = channels(stops.base)
  const a = channels(stops.a)
  const b = channels(stops.b)
  const highlight = channels(stops.highlight)

  const backgroundImage = [
    "url(\"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.280'/></svg>\")",
    `radial-gradient(circle at 66.94% 46.43%, rgba(${base}, 1) 0%, rgba(${base}, 0.844) 19.02%, rgba(${base}, 0.5) 38.05%, rgba(${base}, 0.156) 57.07%, rgba(${base}, 0) 76.1%)`,
    `radial-gradient(circle at 34.69% 66.31%, rgba(${a}, 1) 0%, rgba(${a}, 0.844) 12.73%, rgba(${a}, 0.5) 25.45%, rgba(${a}, 0.156) 38.18%, rgba(${a}, 0) 50.9%)`,
    `radial-gradient(circle at 48.93% 19.32%, rgba(${b}, 1) 0%, rgba(${b}, 0.844) 16.75%, rgba(${b}, 0.5) 33.5%, rgba(${b}, 0.156) 50.25%, rgba(${b}, 0) 67%)`,
    `radial-gradient(circle at 80.23% 87.54%, rgba(${highlight}, 1) 0%, rgba(${highlight}, 0.844) 10.28%, rgba(${highlight}, 0.5) 20.55%, rgba(${highlight}, 0.156) 30.83%, rgba(${highlight}, 0) 41.1%)`,
  ].join(", ")

  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        position: "relative",
        overflow: "hidden",
        width: "100%",
        height: "100%",
        containerType: "size",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: stops.base,
          backgroundImage,
          backgroundSize: "120px 120px, auto, auto, auto, auto",
          backgroundBlendMode: "overlay, normal, normal, normal, normal",
        }}
      />
      <svg
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: 0.28,
          mixBlendMode: "overlay",
        }}
      >
        <filter id="grain-dc893a4f">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.8"
            numOctaves="2"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain-dc893a4f)" />
      </svg>
    </div>
  )
}
