/**
 * Join class names, dropping anything falsy.
 *
 * Six lines instead of clsx + tailwind-merge. There is no conflict-resolution
 * here on purpose: components below decide their own classes and callers
 * append, which at this size never produces the conflicting-utility problem
 * tailwind-merge exists to solve.
 */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}
