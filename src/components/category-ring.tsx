'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { IconArrowRight } from '@/components/icons';

/**
 * The kinds of work, as a 3D fan that drifts.
 *
 * Adapted from the supplied carousel, with the one change that matters here:
 * the cards carry real categories out of the database rather than photographs.
 * This product has no photographs — no job images, no user portraits — and
 * dressing a Kerala job board in stock pictures of somewhere else would be
 * decoration pretending to be content.
 *
 * It is a fan rather than the source's full ring, and that was a correction
 * rather than a preference. A 360-degree ring divides its cards evenly around
 * a circle, so with five of them only one faces the viewer and its neighbours
 * sit at 72 degrees — foreshortened to slivers — while the rest are behind you.
 * It was built that way first and looked broken: two readable cards and a lot
 * of empty space. Spread across the front instead, all five are legible at
 * once and the depth still reads.
 *
 * The rest of the departures are usability:
 *
 *  - It stops when you point at it, and when anything inside takes keyboard
 *    focus. These cards are links, and a link that never stops moving is a
 *    target you have to chase.
 *  - Focus brings a card to the front, so a keyboard user never lands on a
 *    focus ring that is turned out of sight.
 *  - Below `lg` it does not mount; the caller renders the plain grid. A fan is
 *    a wide-screen shape, and on a phone it would cost the most on the devices
 *    that can least afford it.
 */

export type RingItem = {
  publicId: string;
  label: string;
  hint: string;
  href: string;
};

/** How long a card holds the front before the fan drifts on. */
const DWELL_MS = 2600;
/**
 * Horizontal step between neighbouring cards, in pixels.
 *
 * 240 rather than a tighter value because perspective foreshortens the outer
 * cards toward the centre: at 190 the fan drew 731px of a 1120px measure and
 * sat marooned in the middle of the section.
 */
const SPACING = 240;
/** How far each step from centre turns, in degrees. */
const TILT = 34;
/** How far each step from centre recedes, in pixels. */
const DEPTH = 120;

export function CategoryRing({
  items,
  className,
  labels,
}: {
  items: RingItem[];
  className?: string;
  /** Translated names for the two controls. */
  labels: { previous: string; next: string };
}) {
  const [centre, setCentre] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (paused || reducedMotion || items.length < 2) return;

    // A step every few seconds, not a value updated every frame. The movement
    // between two resting states is a CSS transition, so the compositor does
    // the work and React re-renders roughly once every two and a half seconds
    // — against the source's twenty state updates a second, forever.
    timer.current = setInterval(() => {
      setCentre((previous) => (previous + 1) % items.length);
    }, DWELL_MS);

    return () => clearInterval(timer.current);
  }, [paused, reducedMotion, items.length]);

  if (items.length === 0) return null;

  /**
   * Manual control, alongside the drift.
   *
   * The fan moving on its own shows people there is more than one card; it is
   * a poor way to reach a particular one, because the card you want is either
   * not here yet or already leaving. These step it one place and are real
   * buttons — keyboard reachable, labelled, and 44px so they can be hit with a
   * thumb. Using them also pauses the drift through the same focus handling as
   * everything else in the fan, so a card stops where you put it.
   */
  const move = (direction: 1 | -1) => {
    setCentre((previous) => (previous + direction + items.length) % items.length);
  };

  return (
    <div
      className={cn('relative [perspective:1200px]', className)}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <ul className="relative mx-auto h-56 w-full [transform-style:preserve-3d]">
        {items.map((item, index) => {
          // Shortest way round, so stepping from the last card to the first
          // slides one place rather than sweeping back across the whole fan.
          const half = items.length / 2;
          let offset = index - centre;
          if (offset > half) offset -= items.length;
          if (offset < -half) offset += items.length;

          const distance = Math.abs(offset);

          return (
            <li
              key={item.publicId}
              className="absolute inset-x-0 top-0 mx-auto w-56 transition-[transform,opacity] duration-700 ease-out"
              style={{
                transform: `translateX(${offset * SPACING}px) translateZ(${-distance * DEPTH}px) rotateY(${-offset * TILT}deg)`,
                // Fades toward the edges rather than piling up, with a floor
                // of 0.65 — a measured number, not a chosen one. These cards
                // carry real text and hold this opacity as a resting state,
                // not in passing: composited over the page ground, ink at 0.35
                // measured 2.19:1 and at 0.55 still only 3.74:1. 0.65 is the
                // first step that clears 4.5:1, at 5.00:1.
                opacity: Math.max(0.65, 1 - distance * 0.18),
                zIndex: items.length - Math.round(distance),
              }}
            >
              <a
                href={item.href}
                onFocus={() => setCentre(index)}
                // Every card stays reachable. An earlier version hid the four
                // that were not at the front from assistive technology, which
                // would have left a screen-reader user on a wide screen with
                // one of five categories — the fan is this section's only
                // presentation there. Five links is the same number of tab
                // stops the grid has; focus simply brings one to the front.
                className={cn(
                  'flex h-52 flex-col justify-between rounded-2xl border border-border bg-card p-5',
                  'shadow-lg transition-[box-shadow,border-color] duration-300',
                  'hover:border-primary hover:shadow-xl',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                )}
              >
                <span className="text-lg font-semibold text-foreground">{item.label}</span>
                <span className="line-clamp-3 text-sm text-muted-foreground">{item.hint}</span>
              </a>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() => move(-1)}
        aria-label={labels.previous}
        className={cn(
          'absolute start-0 top-1/2 z-20 -translate-y-1/2',
          'inline-flex size-11 items-center justify-center rounded-full',
          'border border-border bg-card text-foreground shadow-md',
          'transition-colors hover:border-primary hover:text-primary',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        )}
      >
        <IconArrowRight className="size-5 rotate-180" />
      </button>

      <button
        type="button"
        onClick={() => move(1)}
        aria-label={labels.next}
        className={cn(
          'absolute end-0 top-1/2 z-20 -translate-y-1/2',
          'inline-flex size-11 items-center justify-center rounded-full',
          'border border-border bg-card text-foreground shadow-md',
          'transition-colors hover:border-primary hover:text-primary',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        )}
      >
        <IconArrowRight className="size-5" />
      </button>
    </div>
  );
}
