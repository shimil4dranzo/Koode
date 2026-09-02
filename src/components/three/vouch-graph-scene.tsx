'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * The Koode graph, in space.
 *
 * Nodes are people, edges are recommendations, and the counts come from the
 * real database — so this is not an abstract "tech" animation, it is a
 * portrait of the actual asset the product accumulates. Scrolling rotates it
 * and draws the edges in one by one, which is exactly what the platform does
 * over time.
 *
 * This file is loaded lazily and only on devices that pass the capability
 * check in vouch-graph-3d.tsx. Everything below assumes it has already been
 * decided that this device can afford WebGL.
 *
 * Performance decisions, all deliberate because the target device is a cheap
 * Android and the launch venue's wifi is not:
 *  - Points + LineSegments, not meshes. Two draw calls for the whole graph.
 *  - No lights, no shadows, no post-processing: unlit materials only.
 *  - Device pixel ratio capped at 1.5. A 3x retina buffer costs 4x the
 *    fragments for detail nobody can see on a constellation of soft dots.
 *  - The loop stops when the canvas scrolls out of view or the tab is
 *    hidden. An animation nobody is looking at is pure battery drain.
 *  - Everything is disposed on unmount. Leaked GPU buffers are the classic
 *    way a three.js component degrades a long-lived single-page session.
 */

type Props = {
  /** Real people on the platform — drives how many nodes appear. */
  peopleCount: number;
  /** Real recommendations — drives how many edges are drawn. */
  vouchCount: number;
  className?: string;
  /**
   * `panel` is the square widget beside the "how it works" steps: a compact
   * object you look *at*. `hero` is the full-bleed backdrop the headline sits
   * on: wider, deeper, dimmer, and framed so the middle stays quiet enough to
   * read type over.
   */
  variant?: 'panel' | 'hero';
};

/** Everything that differs between the two framings, in one place. */
const VARIANTS = {
  panel: {
    nodeScale: 3,
    edgeScale: 4,
    fov: 42,
    cameraZ: 8.2,
    /** How far the camera pulls back across the whole scroll. */
    dolly: 0,
    nodeSize: 0.19,
    verifiedSize: 0.3,
    edgeOpacity: 0.5,
    // On the light card the graph must stay dark enough to read as ink.
    nodeColor: '#7a1c56',
    verifiedColor: '#3b74d4',
    edgeColor: '#9c2f74',
    /** Squash of the sphere into a lens. */
    flatten: 0.55,
    spread: 2.6,
    /** Extra nodes pushed far back to give the hero depth. */
    depthField: 0,
  },
  hero: {
    nodeScale: 5,
    edgeScale: 7,
    fov: 55,
    cameraZ: 9.4,
    // Drifts back as the page scrolls, so the graph recedes behind the
    // content rather than following the reader down the page.
    dolly: 2.2,
    nodeSize: 0.3,
    verifiedSize: 0.46,
    edgeOpacity: 0.85,
    // Much brighter than the panel, because these are additive-blended over
    // near-black rather than over white. The panel's ink green simply does not
    // register against night-900.
    nodeColor: '#f06bb8',
    verifiedColor: '#79b4ff',
    edgeColor: '#c2478e',
    // Flatter and wider: a band across the banner, not a ball in the middle.
    flatten: 0.42,
    spread: 3.8,
    depthField: 70,
  },
} as const;

/**
 * Node and edge counts are clamped so the scene reads well at any scale.
 *
 * The two variants need different floors, and the difference is a question of
 * honesty as much as of composition. The panel sits beside the "how it works"
 * steps as a small diagram, so it stays close to the real numbers. The hero is
 * captioned as a picture of the network the platform builds — illustrative,
 * with the actual counts printed as numerals directly above it — so it is
 * allowed a floor dense enough to read as a network on day one, when the real
 * graph is a dozen people and would otherwise show as a few stray specks
 * across a very large banner.
 */
const LIMITS = {
  panel: { minNodes: 18, maxNodes: 90, minEdges: 16, maxEdges: 130 },
  hero: { minNodes: 58, maxNodes: 130, minEdges: 74, maxEdges: 190 },
} as const;

/**
 * A seeded pseudo-random generator (mulberry32).
 *
 * The layout must be identical on every load: a graph that reshuffles each
 * refresh looks like noise rather than like a thing that exists. Math.random
 * would also make the visual impossible to reason about when something looks
 * wrong.
 */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A soft round dot, drawn once into a canvas.
 *
 * Cheaper and sharper than shipping a PNG, and it means the palette lives in
 * one place rather than being baked into an asset.
 */
function createDotTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.35, 'rgba(255,255,255,0.85)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Positions spread evenly over a sphere, then flattened.
 *
 * A Fibonacci sphere avoids the clumping at the poles that naive random
 * spherical coordinates produce. Squashing the Y axis turns the ball into a
 * lens, which reads as a network seen edge-on rather than as a planet.
 */
function layoutNodes(
  count: number,
  random: () => number,
  spread: number,
  flatten: number,
): Float32Array {
  const positions = new Float32Array(count * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < count; i += 1) {
    const y = 1 - (i / Math.max(1, count - 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;

    // A little jitter so the mathematical regularity does not read as a mesh.
    const wobble = 0.86 + random() * 0.28;
    const scale = spread * wobble;

    positions[i * 3] = Math.cos(theta) * radius * scale;
    positions[i * 3 + 1] = y * scale * flatten;
    positions[i * 3 + 2] = Math.sin(theta) * radius * scale;
  }

  return positions;
}

/**
 * A loose haze of far-off points behind the graph.
 *
 * Pure atmosphere, and cheap: one extra draw call of tiny dots. Without it the
 * hero reads as a diagram floating on a flat colour; with it there is a sense
 * of depth for the graph to sit inside.
 */
function layoutDepthField(count: number, random: () => number): Float32Array {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (random() - 0.5) * 26;
    positions[i * 3 + 1] = (random() - 0.5) * 11;
    // Always well behind the graph itself.
    positions[i * 3 + 2] = -6 - random() * 16;
  }
  return positions;
}

/**
 * Edges between nearby nodes.
 *
 * Connecting each node to its nearest neighbours rather than at random is
 * what makes this look like a referral graph: recommendations cluster
 * locally, because people vouch for people they actually know.
 */
function layoutEdges(
  nodes: Float32Array,
  nodeCount: number,
  edgeBudget: number,
  neighboursPerNode = 2,
): Float32Array {
  const seen = new Set<string>();
  const vertices: number[] = [];

  for (let i = 0; i < nodeCount && vertices.length / 6 < edgeBudget; i += 1) {
    const ax = nodes[i * 3] ?? 0;
    const ay = nodes[i * 3 + 1] ?? 0;
    const az = nodes[i * 3 + 2] ?? 0;

    // Rank the other nodes by distance and keep the closest couple.
    const neighbours: Array<{ index: number; distance: number }> = [];
    for (let j = 0; j < nodeCount; j += 1) {
      if (i === j) continue;
      const dx = ax - (nodes[j * 3] ?? 0);
      const dy = ay - (nodes[j * 3 + 1] ?? 0);
      const dz = az - (nodes[j * 3 + 2] ?? 0);
      neighbours.push({ index: j, distance: dx * dx + dy * dy + dz * dz });
    }
    neighbours.sort((a, b) => a.distance - b.distance);

    for (const neighbour of neighbours.slice(0, neighboursPerNode)) {
      const key = i < neighbour.index ? `${i}:${neighbour.index}` : `${neighbour.index}:${i}`;
      if (seen.has(key)) continue;
      seen.add(key);

      vertices.push(
        ax,
        ay,
        az,
        nodes[neighbour.index * 3] ?? 0,
        nodes[neighbour.index * 3 + 1] ?? 0,
        nodes[neighbour.index * 3 + 2] ?? 0,
      );
      if (vertices.length / 6 >= edgeBudget) break;
    }
  }

  return new Float32Array(vertices);
}

export default function VouchGraphScene({
  peopleCount,
  vouchCount,
  className,
  variant = 'panel',
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const config = VARIANTS[variant];

    /**
     * Small screens get a cheaper scene, not a refused one.
     *
     * A phone has fewer pixels but also far less GPU and a battery the user
     * cares about, so the saving has to come from the work rather than from
     * the resolution alone: fewer nodes, fewer edges, and a lower pixel-ratio
     * ceiling. The composition still reads, because a narrow viewport shows a
     * smaller slice of the graph anyway.
     */
    const compact = window.innerWidth < 768;
    const budgetScale = compact ? 0.55 : 1;
    const pixelRatioCap = compact ? 1.25 : 1.5;

    const limits = LIMITS[variant];
    const nodeCount = Math.round(
      Math.min(
        limits.maxNodes,
        Math.max(limits.minNodes, peopleCount * config.nodeScale),
      ) * budgetScale,
    );
    const edgeBudget = Math.round(
      Math.min(
        limits.maxEdges,
        Math.max(limits.minEdges, vouchCount * config.edgeScale),
      ) * budgetScale,
    );

    const random = seededRandom(0x4b_4f_4f_44); // "KOOD"
    const nodePositions = layoutNodes(nodeCount, random, config.spread, config.flatten);
    const edgePositions = layoutEdges(
      nodePositions,
      nodeCount,
      edgeBudget,
      variant === 'hero' ? 3 : 2,
    );

    // --- renderer ---------------------------------------------------------
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        // Signals the browser it may use the integrated GPU. On a laptop at a
        // launch event that is the difference between warm and hot.
        powerPreference: 'low-power',
      });
    } catch {
      // Context creation can still fail on a device that claimed support.
      // The caller keeps the SVG fallback mounted underneath, so bailing out
      // silently leaves a complete page.
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap));
    renderer.setSize(container.clientWidth, container.clientHeight, false);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      config.fov,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      100,
    );
    camera.position.set(0, 0.4, config.cameraZ);

    const group = new THREE.Group();
    scene.add(group);

    // --- nodes ------------------------------------------------------------
    const dot = createDotTexture();
    const nodeGeometry = new THREE.BufferGeometry();
    nodeGeometry.setAttribute('position', new THREE.BufferAttribute(nodePositions, 3));

    const nodeMaterial = new THREE.PointsMaterial({
      // Kerala green, the same brand-600 the rest of the page uses.
      color: new THREE.Color(config.nodeColor),
      size: config.nodeSize,
      map: dot,
      transparent: true,
      // Soft dots overlapping look better added together than depth-sorted,
      // and additive blending skips the sorting entirely.
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const nodes = new THREE.Points(nodeGeometry, nodeMaterial);
    group.add(nodes);

    // A second, sparser pass in the "verified" blue, so the trust marker that
    // matters in the product is visible in its portrait too.
    const verifiedCount = Math.max(1, Math.floor(nodeCount / 6));
    const verifiedPositions = new Float32Array(verifiedCount * 3);
    for (let i = 0; i < verifiedCount; i += 1) {
      const source = (i * 6) % nodeCount;
      verifiedPositions[i * 3] = nodePositions[source * 3] ?? 0;
      verifiedPositions[i * 3 + 1] = nodePositions[source * 3 + 1] ?? 0;
      verifiedPositions[i * 3 + 2] = nodePositions[source * 3 + 2] ?? 0;
    }
    const verifiedGeometry = new THREE.BufferGeometry();
    verifiedGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(verifiedPositions, 3),
    );
    const verifiedMaterial = new THREE.PointsMaterial({
      color: new THREE.Color(config.verifiedColor),
      size: config.verifiedSize,
      map: dot,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const verifiedNodes = new THREE.Points(verifiedGeometry, verifiedMaterial);
    group.add(verifiedNodes);

    // --- depth haze (hero only) --------------------------------------------
    let hazeGeometry: THREE.BufferGeometry | undefined;
    let hazeMaterial: THREE.PointsMaterial | undefined;
    if (config.depthField > 0) {
      hazeGeometry = new THREE.BufferGeometry();
      hazeGeometry.setAttribute(
        'position',
        new THREE.BufferAttribute(
          layoutDepthField(Math.round(config.depthField * budgetScale), random),
          3,
        ),
      );
      hazeMaterial = new THREE.PointsMaterial({
        color: new THREE.Color('#f0a8d0'),
        size: 0.07,
        map: dot,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      });
      // Added to the scene, not the group: the haze should sit still while the
      // graph turns, or the whole field spins and reads as a screensaver.
      scene.add(new THREE.Points(hazeGeometry, hazeMaterial));
    }

    // --- edges ------------------------------------------------------------
    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute('position', new THREE.BufferAttribute(edgePositions, 3));
    // Nothing is drawn until scroll reveals it — the graph accumulates.
    edgeGeometry.setDrawRange(0, 0);

    const edgeMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(config.edgeColor),
      transparent: true,
      opacity: config.edgeOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    group.add(edges);

    const totalEdgeVertices = edgePositions.length / 3;

    // --- state driven from outside the loop --------------------------------
    let scrollProgress = 0;
    let visible = true;
    let running = true;
    let frameHandle = 0;

    const readScroll = () => {
      const rect = container.getBoundingClientRect();
      const viewport = window.innerHeight || 1;
      // 0 when the element's top reaches the bottom of the viewport, 1 once
      // it has travelled a full viewport height past it.
      const raw = (viewport - rect.top) / (viewport + rect.height);
      scrollProgress = Math.min(1, Math.max(0, raw));
    };
    readScroll();

    // Passive, and it only stores a number — the actual work happens in the
    // animation frame, so a fast scroll cannot queue up expensive handlers.
    const onScroll = () => readScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    const onResize = () => {
      const width = container.clientWidth;
      const height = Math.max(1, container.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      readScroll();
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    // Stop entirely when off-screen or backgrounded.
    const visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? false;
      },
      { threshold: 0 },
    );
    visibilityObserver.observe(container);

    const onVisibilityChange = () => {
      if (document.hidden) visible = false;
      else readScroll();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // --- the loop ----------------------------------------------------------
    const clock = new THREE.Clock();
    let revealed = 0;

    const render = () => {
      if (!running) return;
      frameHandle = requestAnimationFrame(render);
      if (!visible || document.hidden) return;

      const elapsed = clock.getElapsedTime();

      // A slow constant drift, plus a quarter turn driven by scroll: the
      // graph is alive when still, and responds when the page moves.
      group.rotation.y = elapsed * 0.08 + scrollProgress * Math.PI * 0.5;
      group.rotation.x = Math.sin(elapsed * 0.12) * 0.06 + scrollProgress * 0.18;

      // The hero graph recedes as the reader scrolls past, so the banner hands
      // the page over instead of trailing along behind the next section.
      if (config.dolly > 0) {
        camera.position.z = config.cameraZ + scrollProgress * config.dolly;
        camera.position.y = 0.4 - scrollProgress * 0.5;
        camera.lookAt(0, 0, 0);
      }

      // Edges appear as the section is scrolled through. Eased toward the
      // target rather than snapped, so a flick of the wheel does not make the
      // whole graph pop into existence.
      const target = Math.floor(totalEdgeVertices * Math.min(1, scrollProgress * 1.6));
      revealed += (target - revealed) * 0.08;
      edgeGeometry.setDrawRange(0, Math.max(0, Math.floor(revealed)));

      renderer.render(scene, camera);
    };
    frameHandle = requestAnimationFrame(render);

    // --- teardown -----------------------------------------------------------
    return () => {
      running = false;
      cancelAnimationFrame(frameHandle);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();

      nodeGeometry.dispose();
      verifiedGeometry.dispose();
      edgeGeometry.dispose();
      nodeMaterial.dispose();
      verifiedMaterial.dispose();
      edgeMaterial.dispose();
      hazeGeometry?.dispose();
      hazeMaterial?.dispose();
      dot.dispose();
      renderer.dispose();

      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [peopleCount, vouchCount, variant]);

  return <div ref={containerRef} aria-hidden="true" className={className} />;
}
