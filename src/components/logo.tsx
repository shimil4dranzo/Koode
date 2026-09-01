import { cn } from '@/lib/cn';

/**
 * The Koode mark.
 *
 * A rounded Kerala-green tile with a "K" drawn in rounded strokes — the same
 * motif as the installed PWA icon, so the tab, the home-screen icon and the
 * header all read as one thing. Inline SVG with no <defs> ids, so it can
 * appear any number of times on a page without id collisions, and the gradient
 * lives on the wrapping element where CSS can do it.
 *
 * Decorative by default: the wordmark next to it carries the name, so the mark
 * itself is aria-hidden. Size it with a `size-*` class.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-xl',
        'bg-gradient-to-br from-brand-500 to-brand-700 shadow-sm',
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-[62%] text-white"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7.2 4.5v15" />
        <path d="M7.2 12l9.3-7.5" />
        <path d="M7.2 12l9.3 7.5" />
      </svg>
    </span>
  );
}
