'use client';

import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A ring of cards that turns, tilting toward the pointer.
 *
 * Installed from the supplied source with the defects that would have shown up
 * on this product's target device fixed. Each change is marked below; the
 * layout, the look and the API are unchanged.
 */

interface ImageCard {
  id: string;
  src: string;
  alt: string;
  rotation: number;
}

interface ImageCarouselHeroProps {
  title: string;
  subtitle: string;
  description: string;
  ctaText: string;
  onCtaClick?: () => void;
  images: ImageCard[];
  features?: Array<{
    title: string;
    description: string;
  }>;
}

export function ImageCarouselHero({
  title,
  subtitle,
  description,
  ctaText,
  onCtaClick,
  images,
  features = [
    {
      title: 'Realistic Results',
      description: 'Realistic Results Photos that look professionally crafted',
    },
    {
      title: 'Fast Generation',
      description: 'Turn ideas into images in seconds.',
    },
    {
      title: 'Diverse Styles',
      description: 'Choose from a wide range of artistic options.',
    },
  ],
}: ImageCarouselHeroProps) {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [spin, setSpin] = useState(0);

  /**
   * FIXED — the ring turns on an animation frame, not a 50ms interval.
   *
   * The original set React state every 50ms forever, re-rendering the whole
   * carousel twenty times a second for the life of the page whether or not
   * anyone was looking at it. On the cheap Android this product is built for
   * that is a visible battery cost for a decoration.
   *
   * It is also now one number instead of an array of per-card angles: the
   * cards are evenly spaced, so their offsets are a function of their index and
   * never needed to be stored. That removes the original's first-tick bug,
   * where `prev[i] + 0.5` ran against an empty array and turned every angle
   * into NaN until the second effect populated it.
   *
   * Honours prefers-reduced-motion by simply not starting.
   */
  const frame = useRef(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let last = performance.now();
    const step = (now: number) => {
      const elapsed = now - last;
      last = now;
      // Same speed as the original: 0.5 degrees every 50ms.
      setSpin((previous) => (previous + elapsed * 0.01) % 360);
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);

    return () => cancelAnimationFrame(frame.current);
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePosition({
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    });
  };

  return (
    // FIXED: min-h-dvh, not min-h-screen. 100vh on mobile Safari is taller
    // than the visible area, so the section ran under the browser chrome.
    <div className="relative w-full min-h-dvh bg-background overflow-hidden">
      {/* Animated background gradient */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-primary/5 to-transparent rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-primary/5 to-transparent rounded-full blur-3xl animate-pulse" />
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center min-h-dvh px-4 sm:px-6 lg:px-8">
        <div
          className="relative w-full max-w-6xl h-96 sm:h-[500px] mb-12 sm:mb-16"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setMousePosition({ x: 0.5, y: 0.5 })}
        >
          <div className="absolute inset-0 flex items-center justify-center [perspective:1000px]">
            {images.map((image, index) => {
              // FIXED: derived from index and one spin value, so there is no
              // window where the angle is undefined.
              const angle =
                ((spin + index * (360 / Math.max(1, images.length))) * Math.PI) / 180;

              // FIXED: the radius was a hard 180px, which on a 375px phone
              // threw the cards past both edges. It now scales with the
              // container via a CSS variable set below.
              const x = Math.cos(angle);
              const y = Math.sin(angle);

              const perspectiveX = (mousePosition.x - 0.5) * 20;
              const perspectiveY = (mousePosition.y - 0.5) * 20;

              return (
                <div
                  key={image.id}
                  className="absolute w-24 h-32 sm:w-40 sm:h-48 transition-transform duration-300 [--ring:110px] sm:[--ring:180px]"
                  style={{
                    transform: `
                      translate(calc(${x} * var(--ring)), calc(${y} * var(--ring)))
                      rotateX(${perspectiveY}deg)
                      rotateY(${perspectiveX}deg)
                      rotateZ(${image.rotation}deg)
                    `,
                    transformStyle: 'preserve-3d',
                  }}
                >
                  <div
                    className={cn(
                      'relative w-full h-full rounded-2xl overflow-hidden shadow-2xl',
                      'transition-all duration-300 hover:scale-110',
                      'cursor-pointer group',
                    )}
                    style={{ transformStyle: 'preserve-3d' }}
                  >
                    <Image
                      src={image.src || '/placeholder.svg'}
                      alt={image.alt}
                      fill
                      // FIXED: sizes was absent, so next/image served a
                      // full-width source for a 96px-wide card.
                      sizes="(max-width: 640px) 96px, 160px"
                      className="object-cover group-hover:scale-110 transition-transform duration-500"
                      priority={index < 3}
                    />
                    <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="relative z-20 text-center max-w-2xl mx-auto mb-12 sm:mb-16">
          {/* FIXED: `subtitle` was accepted and then never rendered. */}
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground mb-3">
            {subtitle}
          </p>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground mb-4 sm:mb-6 text-balance leading-tight">
            {title}
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground mb-8 text-balance">
            {description}
          </p>

          <button
            type="button"
            onClick={onCtaClick}
            className={cn(
              'inline-flex items-center gap-2 px-8 py-3 rounded-full',
              'min-h-touch bg-primary text-primary-foreground font-medium',
              'hover:shadow-lg hover:scale-105 transition-all duration-300',
              'active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'group',
            )}
          >
            {ctaText}
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        <ul className="relative z-20 w-full max-w-4xl grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 mt-12 sm:mt-16">
          {features.map((feature) => (
            <li
              key={feature.title}
              className={cn(
                'text-center p-6 rounded-xl',
                'bg-card/50 backdrop-blur-sm border border-border/50',
                'hover:bg-card hover:border-border transition-all duration-300',
                'group',
              )}
            >
              <h3 className="text-lg sm:text-xl font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">
                {feature.title}
              </h3>
              <p className="text-sm sm:text-base text-muted-foreground">
                {feature.description}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
