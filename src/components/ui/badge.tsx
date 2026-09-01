import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Status markers.
 *
 * Every badge pairs a colour with a glyph and a word. Colour alone fails for
 * colour-blind users and in bright sunlight on a cheap screen — and the one
 * badge that must never be misread is "verified member".
 */

type Tone = 'neutral' | 'verified' | 'open' | 'warn' | 'danger';

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-700 border-ink-200',
  verified: 'bg-verify-100 text-verify-600 border-verify-600',
  open: 'bg-brand-100 text-brand-700 border-brand-600',
  warn: 'bg-warn-100 text-warn-600 border-warn-600',
  danger: 'bg-danger-100 text-danger-600 border-danger-600',
};

export type BadgeProps = {
  tone?: Tone;
  /** A short glyph shown before the label. Decorative — the label carries it. */
  glyph?: string;
  children: ReactNode;
  className?: string;
};

export function Badge({ tone = 'neutral', glyph, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5',
        'text-sm font-medium leading-6',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {glyph ? <span aria-hidden="true">{glyph}</span> : null}
      {children}
    </span>
  );
}
