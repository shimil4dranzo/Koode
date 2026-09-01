'use client';

import dynamic from 'next/dynamic';
import { useSyncExternalStore } from 'react';
import { VouchNetworkArt } from '@/components/art';

/**
 * Decides whether this device gets the WebGL graph, and loads it if so.
 *
 * The 3D scene is genuinely nice and genuinely expensive — three.js is around
 * 128 KB gzipped on its own, before a single frame is drawn. This product's
 * whole premise is a low-end Android on patchy mobile data, so the scene is
 * treated as an enhancement for capable devices rather than as the page:
 *
 *  - `next/dynamic` with `ssr: false` keeps three.js out of the shared bundle
 *    entirely. A phone that fails the checks below never downloads a byte of
 *    it, which is the part that actually matters.
 *  - The SVG drawing renders immediately and stays until WebGL has something
 *    to show, so there is never a hole in the layout.
 *  - Every check below is a reason to *not* load: the default answer is no.
 *
 * The result: the launch demo on a laptop or a good phone gets the real 3D,
 * and a five-year-old handset on venue wifi gets the same fast page it had.
 */

const VouchGraphScene = dynamic(() => import('./vouch-graph-scene'), {
  ssr: false,
});

type NavigatorWithHints = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
};

/**
 * Whether WebGL exists at all. Cached forever on purpose: unlike the motion
 * preference or the connection, this cannot change while the page is open, and
 * each probe allocates a real GL context.
 */
let webglSupport: boolean | undefined;
function hasWebgl(): boolean {
  if (webglSupport === undefined) {
    try {
      const canvas = document.createElement('canvas');
      webglSupport = Boolean(
        canvas.getContext('webgl2') ??
          canvas.getContext('webgl') ??
          canvas.getContext('experimental-webgl'),
      );
    } catch {
      webglSupport = false;
    }
  }
  return webglSupport;
}

/** Every reason a device should be left alone, in one place. */
function shouldRender3d(): boolean {
  if (typeof window === 'undefined') return false;

  // Motion is a preference. Someone who asked for less of it should not be
  // handed a rotating graph, however tasteful.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;

  // Note: deliberately no minimum width. An earlier version refused anything
  // under 1024px, which meant every phone held upright got the fallback — and
  // phones are how most of this audience arrives. Width is a poor proxy for
  // capability anyway: a current mid-range Android runs this comfortably while
  // some wide, old laptops do not. The checks below measure the things that
  // actually decide whether the scene is affordable, and the scene itself
  // scales its own cost down on small screens.
  const nav = navigator as NavigatorWithHints;

  // Data Saver is an explicit request not to spend the user's money.
  if (nav.connection?.saveData) return false;

  // A connection slow enough that the extra payload would arrive long after
  // anyone had stopped looking at the banner.
  //
  // '3g' is deliberately NOT in this list, despite being the obvious candidate
  // for a rural audience. Two reasons. Chrome's effectiveType is a rolling
  // estimate, not a measurement — it reports '3g' on a fast local connection
  // often enough that keying a visible feature to it makes the feature look
  // broken. And the cost here is not a blocked page: the chunk is lazy and
  // loads after the page is already interactive, so a slow connection means
  // the graph simply arrives late. The user who genuinely cannot spare the
  // data has already said so through Data Saver, which is checked above and is
  // a statement of intent rather than a guess.
  const unusable = ['slow-2g', '2g'];
  if (nav.connection?.effectiveType && unusable.includes(nav.connection.effectiveType)) {
    return false;
  }

  // Reported in GiB, and only by Chromium — absent means "do not know", which
  // is not a reason to refuse.
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory < 4) return false;

  return hasWebgl();
}

/**
 * A tiny store holding the answer, recomputed when the answer could change.
 *
 * The first version of this cached the decision permanently, which was wrong:
 * the motion preference can be toggled while the page is open, and the
 * connection can change under a moving phone. A frozen answer meant the page
 * kept honouring a preference the user had since changed.
 *
 * Recomputing is cheap: the only expensive input, the WebGL probe, is cached
 * separately above.
 */
let current: boolean | undefined;
const listeners = new Set<() => void>();
let teardown: (() => void) | undefined;

function getSnapshot(): boolean {
  current ??= shouldRender3d();
  return current;
}

/** Capability is a client-only fact, so the server always answers "no". */
function getServerSnapshot(): boolean {
  return false;
}

function reevaluate(): void {
  const next = shouldRender3d();
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);

  if (teardown === undefined) {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    motion.addEventListener('change', reevaluate);

    // Walking out of wifi and onto a weak mobile signal is a real thing that
    // happens mid-page, and Data Saver can be switched on at any moment.
    const connection = (navigator as NavigatorWithHints).connection as
      | (EventTarget & { saveData?: boolean })
      | undefined;
    connection?.addEventListener?.('change', reevaluate);

    teardown = () => {
      motion.removeEventListener('change', reevaluate);
      connection?.removeEventListener?.('change', reevaluate);
    };
  }

  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && teardown !== undefined) {
      teardown();
      teardown = undefined;
    }
  };
}

export function VouchGraph3d({
  peopleCount,
  vouchCount,
  className,
  variant = 'panel',
  fallbackClassName,
}: {
  peopleCount: number;
  vouchCount: number;
  className?: string;
  /**
   * `panel` is the self-contained square used mid-page. `hero` is the wide,
   * dim, full-bleed backdrop the headline sits on top of.
   */
  variant?: 'panel' | 'hero';
  /** Lets the hero style its SVG fallback differently from the canvas. */
  fallbackClassName?: string;
}) {
  /**
   * The server renders the SVG, and the client swaps in WebGL only if the
   * checks pass. Deliberately not `useState` + `useEffect`: this is exactly
   * the "external, client-only value" that useSyncExternalStore exists for,
   * and it makes the server/client difference explicit instead of a
   * post-hydration correction.
   */
  const enabled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!enabled) {
    return (
      <VouchNetworkArt
        animated
        className={fallbackClassName ?? className}
      />
    );
  }

  if (variant === 'hero') {
    // The hero backdrop fills its container; the section positions it.
    return (
      <VouchGraphScene
        peopleCount={peopleCount}
        vouchCount={vouchCount}
        variant="hero"
        className={className}
      />
    );
  }

  return (
    <div className={className}>
      {/* Square-ish: the graph is a volume, and a letterbox crops it badly. */}
      <VouchGraphScene
        peopleCount={peopleCount}
        vouchCount={vouchCount}
        variant="panel"
        className="aspect-square w-full"
      />
    </div>
  );
}
