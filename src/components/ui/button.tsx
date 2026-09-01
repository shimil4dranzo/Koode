import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Every button is at least 44px tall (--spacing-touch). That is not a stylistic
 * choice: these are thumbs on a 360px phone, often outdoors, sometimes in a
 * hurry, and a missed tap on "Reject" in the claim flow is a real harm.
 */

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';
type Size = 'md' | 'lg';

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'bg-brand-600 text-white border border-brand-600 hover:bg-brand-700 active:bg-brand-700',
  secondary:
    'bg-paper-raised text-ink-900 border border-ink-300 hover:bg-ink-100 active:bg-ink-200',
  quiet: 'bg-transparent text-ink-700 border border-transparent hover:bg-ink-100',
  danger:
    'bg-paper-raised text-danger-600 border border-danger-600 hover:bg-danger-100 active:bg-danger-100',
};

const SIZE_CLASSES: Record<Size, string> = {
  md: 'min-h-touch px-4 py-2.5 text-base',
  lg: 'min-h-14 px-6 py-3.5 text-lg w-full sm:w-auto',
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** Renders a spinner and blocks input. Use for in-flight submissions. */
  busy?: boolean;
  children: ReactNode;
};

export function Button({
  variant = 'primary',
  size = 'md',
  busy = false,
  className,
  disabled,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled ?? busy}
      aria-busy={busy || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium',
        'transition disabled:opacity-55 disabled:cursor-not-allowed',
        // Press feedback within the same frame as the tap. Scale, not layout.
        'motion-safe:active:scale-[0.98]',
        // Never rely on colour alone; the border carries the shape too.
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...rest}
    >
      {busy ? (
        <span
          aria-hidden="true"
          className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      {children}
    </button>
  );
}
