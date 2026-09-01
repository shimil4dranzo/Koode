import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Card({
  children,
  className,
  as: Tag = 'div',
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'article' | 'section' | 'li';
  style?: CSSProperties;
  /**
   * Passes `data-*` through, so a card can opt into a scroll reveal without
   * this component knowing anything about animation.
   */
  [dataAttribute: `data-${string}`]: unknown;
}) {
  return (
    <Tag
      className={cn(
        'rounded-card border border-ink-200 bg-paper-raised p-4 sm:p-5',
        className,
      )}
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
