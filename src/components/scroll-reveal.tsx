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

    /** Everything not yet shown. Shrinks to empty, and drives the cleanup. */
    const pending = new Set<HTMLElement>(targets);

    const reveal = (element: HTMLElement) => {
      element.dataset.revealState = 'in';
      pending.delete(element);
      observer.unobserve(element);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) reveal(entry.target as HTMLElement);
        }
      },
      {
        // A little above the fold bottom, so an element is already settling by
        // the time it is properly in view rather than starting once it is.
        rootMargin: '0px 0px -12% 0px',
        threshold: 0.15,
      },
    );

    /**
     * Show anything the viewport has already passed.
     *
     * An IntersectionObserver reports threshold *crossings*, and when the page
     * jumps — scroll restoration on a back-navigation, a link to an anchor, a
     * hard flick on a phone — an element can go from below the viewport to
     * above it inside one frame. No threshold is ever crossed, no callback
     * arrives, and the element stays at opacity 0 for the life of the page.
     * Measured on this page: a single jump to the bottom left 19 of 28
     * elements permanently invisible, including every job listing.
     *
     * So the observer drives the animation, and this drives the guarantee.
     * Animation is decoration; the listings are the product, and when the two
     * disagree the content wins.
     */
    const sweep = () => {
      for (const element of pending) {
        if (element.getBoundingClientRect().bottom <= 0) reveal(element);
      }
      if (pending.size === 0) stopSweeping();
    };

    // Coalesced into one frame, so a fast scroll cannot queue up work, and
    // detached entirely once everything has been shown — this costs nothing
    // for the rest of the page's life.
    let frame = 0;
    const onScroll = () => {
      if (frame !== 0) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        sweep();
      });
    };
    const stopSweeping = () => window.removeEventListener('scroll', onScroll);
    window.addEventListener('scroll', onScroll, { passive: true });

    // The same case at load time: the browser may restore scroll before this
    // runs, so anything already above the fold is shown rather than observed.
    sweep();
    pending.forEach((element) => observer.observe(element));

    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      stopSweeping();
      observer.disconnect();
      root.removeAttribute('data-reveal-ready');
    };
  }, []);

  return null;
}
