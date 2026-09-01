'use client';

import { useEffect } from 'react';

/**
 * Turns the scroll reveals on, and drives them.
 *
 * Deliberately small and deliberately opt-in:
 *
 *  - It sets `data-reveal-ready` on <html>. Until that attribute exists the
 *    CSS leaves everything visible, so no-JS, an old browser, or a failed
 *    script all render the finished page rather than a blank one. This is the
 *    single most common way scroll animation ships broken, so the failure mode
 *    is chosen rather than inherited.
 *  - It observes; it does not listen to scroll. An IntersectionObserver fires
 *    a handful of times per page, where a scroll handler fires per frame and
 *    has to be throttled. On the phones this app targets that difference is
 *    the whole budget.
 *  - Each element is unobserved once revealed. Nothing re-animates on the way
 *    back up: content that flickers when you scroll past it twice reads as a
 *    bug, not as polish.
 *
 * If the user prefers reduced motion, the ready flag is never set at all — the
 * CSS then has nothing to hide, which is cheaper and more certain than relying
 * on the media query alone.
 */
export function ScrollReveal() {
  useEffect(() => {
    const root = document.documentElement;

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    if (prefersReducedMotion || !('IntersectionObserver' in window)) return;

    root.setAttribute('data-reveal-ready', '');

    const targets = document.querySelectorAll<HTMLElement>('[data-reveal], [data-draw]');

    // Paths that draw themselves need their own length as the dash pattern;
    // measuring here keeps the markup free of hard-coded magic numbers that
    // would silently break the moment a path is edited.
    targets.forEach((element) => {
      if (element instanceof SVGPathElement) {
        const length = Math.ceil(element.getTotalLength());
        element.style.setProperty('--draw-length', String(length));
      }
    });

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.revealState = 'in';
          observer.unobserve(entry.target);
        }
      },
      {
        // A little above the fold bottom, so an element is already settling by
        // the time it is properly in view rather than starting once it is.
        rootMargin: '0px 0px -12% 0px',
        threshold: 0.15,
      },
    );

    targets.forEach((element) => observer.observe(element));

    return () => {
      observer.disconnect();
      root.removeAttribute('data-reveal-ready');
    };
  }, []);

  return null;
}
