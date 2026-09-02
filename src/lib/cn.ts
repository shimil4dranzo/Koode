/**
 * Join class names, dropping anything falsy.
 *
 * Six lines instead of clsx + tailwind-merge, and there is no
 * conflict-resolution here.
 *
 * That is still the right trade — tailwind-merge is a real dependency in every
 * bundle that touches it — but the original claim here, that conflicts "never"
 * arise at this size, turned out to be wrong. Passing `bg-navy-800` to a Card
 * whose base is `bg-paper-raised` emitted both, let the cascade choose, and
 * produced white cards carrying near-white text. Nothing caught it: both
 * colours were fine on their own and the pairing only existed at runtime.
 *
 * So the rule is not "conflicts cannot happen", it is: a component that owns a
 * visual decision must expose it as a prop rather than expecting callers to
 * override the class. See the `tone` prop on Card.
 */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}
