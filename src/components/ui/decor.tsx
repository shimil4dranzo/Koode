/**
 * A soft brand-green wash that fades out behind a page's heading.
 *
 * Pure decoration, and cheap on purpose: one gradient div, no image, no
 * JavaScript, and it sits behind ink-900 text on a near-white tint so it
 * cannot move any measured contrast pair. The parent needs `relative`.
 */
export function PageGlow() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 bg-gradient-to-b from-brand-100 via-brand-100/40 to-transparent"
    />
  );
}
