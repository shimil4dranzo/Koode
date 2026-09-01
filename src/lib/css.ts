import type { CSSProperties } from 'react';

/**
 * A `style` object that may also carry CSS custom properties.
 *
 * React types `style` as CSSProperties, which has no room for `--my-var`, so
 * passing a custom property is a type error without this widening. The scroll
 * reveals lean on exactly that — each element carries its own
 * `--reveal-delay` — and one named type is better than an `as` cast repeated
 * at every call site.
 */
export type StyleWithVars = CSSProperties & Record<`--${string}`, string | number>;
