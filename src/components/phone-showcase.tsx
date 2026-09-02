'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { LogoWordmark } from '@/components/logo';
import { IconArrowRight, IconMapPin } from '@/components/icons';

/**
 * The product, in a phone you can tilt.
 *
 * This replaced a flat bordered box that was standing in for a device. Two
 * things make it worth the code:
 *
 *  - It is the product, not a picture of one. The listings are the same rows
 *    the openings page renders, straight from the database, and the tabs
 *    genuinely filter them. A screenshot would go stale the first time a card
 *    changed, and would be showing invented jobs on a page whose argument is
 *    that its listings are real.
 *  - It tilts toward the pointer, which is what makes a mockup read as an
 *    object rather than a rectangle. The tilt is capped low: past about eight
 *    degrees the text inside starts to distort and the screen stops being
 *    readable, which defeats the point of showing it.
 *
 * Everything expensive is opt-out. Tilt is pointer-only, so it never runs on a
 * touch device; it is skipped entirely under prefers-reduced-motion; and the
 * transform lives on one element so the compositor handles it without React
 * re-rendering the list.
 */

export type PhoneItem = {
  publicId: string;
  title: string;
  localityLabel: string;
  engagementType: string;
  engagementLabel: string;
  href: string;
};

/** Degrees. Past this the screen text starts to smear. */
const MAX_TILT = 8;

export function PhoneShowcase({
  items,
  labels,
  findWorkHref,
  className,
}: {
  items: PhoneItem[];
  labels: { all: string; findWork: string; filterLabel: string };
  /** Where the button goes. Passed in rather than derived from a row's URL,
      which broke as soon as the list was empty. */
  findWorkHref: string;
  className?: string;
}) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState<string>('all');
  const [allowTilt, setAllowTilt] = useState(false);
  const frame = useRef(0);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    // A coarse pointer means a finger: there is nothing to follow, and the
    // hover state would stick after a tap.
    const fine = window.matchMedia('(pointer: fine)');
    const sync = () => setAllowTilt(fine.matches && !motion.matches);
    sync();
    motion.addEventListener('change', sync);
    fine.addEventListener('change', sync);
    return () => {
      motion.removeEventListener('change', sync);
      fine.removeEventListener('change', sync);
    };
  }, []);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!allowTilt) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;

    // Coalesced: a pointer fires far more often than the screen redraws.
    if (frame.current !== 0) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      setTilt({ x: -y * MAX_TILT * 2, y: x * MAX_TILT * 2 });
    });
  };

  // One tab per kind of work actually present, so the control never offers a
  // filter that returns nothing.
  const kinds = Array.from(
    new Map(items.map((item) => [item.engagementType, item.engagementLabel])).entries(),
  );
  const visible =
    active === 'all' ? items : items.filter((item) => item.engagementType === active);

  return (
    <div
      className={cn('[perspective:1200px]', className)}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setTilt({ x: 0, y: 0 })}
    >
      <div
        className="relative transition-transform duration-300 ease-out [transform-style:preserve-3d]"
        style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}
      >
        {/* Side buttons, on the body rather than floating beside it. */}
        <span
          aria-hidden="true"
          className="absolute -start-[3px] top-24 h-12 w-[3px] rounded-s bg-navy-800"
        />
        <span
          aria-hidden="true"
          className="absolute -end-[3px] top-32 h-16 w-[3px] rounded-e bg-navy-800"
        />

        {/* The device body. */}
        <div className="rounded-[2.25rem] bg-navy-900 p-2.5 shadow-2xl">
          {/* The screen. */}
          <div className="relative overflow-hidden rounded-[1.75rem] bg-paper-raised">
            {/* Dynamic island. Decorative — it is part of the drawing of a
                phone, not something the page is telling you. */}
            <span
              aria-hidden="true"
              className="absolute start-1/2 top-2 z-10 h-5 w-20 -translate-x-1/2 rounded-full bg-navy-900"
            />

            <div className="px-4 pb-4 pt-9">
              <LogoWordmark className="w-20" />

              {/* Real filters over real rows. */}
              <div
                role="tablist"
                aria-label={labels.filterLabel}
                className="mt-3 flex gap-1.5 overflow-x-auto pb-1"
              >
                {[['all', labels.all] as const, ...kinds].map(([value, label]) => {
                  const selected = active === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setActive(value)}
                      className={cn(
                        'inline-flex min-h-touch shrink-0 items-center rounded-full border px-4 text-sm transition-colors',
                        selected
                          ? 'border-brand-600 bg-brand-600 text-white'
                          : 'border-ink-300 text-ink-700 hover:border-brand-600',
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Fixed height so switching tabs does not resize the phone —
                  a device that changes shape stops reading as a device. */}
              <ul className="mt-3 flex h-56 flex-col gap-2 overflow-y-auto">
                {visible.slice(0, 4).map((item) => (
                  <li key={item.publicId}>
                    <a
                      href={item.href}
                      className={cn(
                        'block rounded-xl border border-ink-200 p-3 transition-colors',
                        'hover:border-brand-600 hover:bg-brand-100/40',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verify-600',
                      )}
                    >
                      <span className="block text-base font-medium text-ink-900">
                        {item.title}
                      </span>
                      <span className="mt-1 flex items-center gap-1.5 text-sm text-ink-700">
                        <IconMapPin className="size-4 text-ink-500" />
                        {item.localityLabel}
                        <span aria-hidden="true">·</span>
                        {item.engagementLabel}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>

              <a
                href={findWorkHref}
                className="mt-3 flex min-h-touch items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 font-medium text-white transition-colors hover:bg-brand-700"
              >
                {labels.findWork}
                <IconArrowRight className="size-4.5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
