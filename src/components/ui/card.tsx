import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Surfaces a card can sit on.
 *
 * A prop rather than a class the caller passes, because `cn` deliberately does
 * no conflict resolution: a caller adding `bg-navy-800` does not replace
 * `bg-paper-raised`, it emits alongside it and the cascade picks a winner. That
 * is exactly how the "How Koode works" cards ended up white with near-white
 * text on them — unreadable, and invisible to every automated check, because
 * both colours were individually fine and the pairing only existed at runtime.
 *
 * Naming the surface makes the choice explicit and keeps the text colour that
 * belongs with it in the same place.
 */
const TONES = {
  /** White card on the page ground. The default everywhere. */
  paper: 'border-ink-200 bg-paper-raised shadow-sm',
  /** Slightly sunken, for a panel inside a page rather than on it. */
  sunken: 'border-ink-200 bg-ink-100',
  /** On a dark band: the card is part of the band, not a hole in it. */
  inverse: 'border-white/20 bg-navy-800 text-white',
} as const;

export function Card({
  children,
  className,
  as: Tag = 'div',
  tone = 'paper',
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'article' | 'section' | 'li';
  tone?: keyof typeof TONES;
  style?: CSSProperties;
  /**
   * Passes `data-*` through, so a card can opt into a scroll reveal without
   * this component knowing anything about animation.
   */
  [dataAttribute: `data-${string}`]: unknown;
}) {
  return (
    <Tag
      className={cn('rounded-2xl border p-4 sm:p-5', TONES[tone], className)}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-card border border-dashed border-ink-300 px-4 py-10 text-center">
      <p className="text-lg font-medium text-ink-900">{title}</p>
      {hint ? <p className="mt-1 text-base text-ink-700">{hint}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
