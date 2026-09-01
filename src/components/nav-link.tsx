'use client';

import type { ReactNode } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/cn';

/**
 * A header link that knows when it is the current section.
 *
 * "Where am I" must be readable off the navigation itself — colour AND weight
 * AND an underline bar, never colour alone, plus `aria-current` so a screen
 * reader announces it. `usePathname` from the i18n wrapper strips the locale
 * prefix, so matching works identically for /ml and /en.
 *
 * Prefix matching on purpose: /openings/abc123 still highlights "Openings",
 * because a person reading one posting is still in the openings section.
 */
export function NavLink({
  href,
  children,
  emphasis = false,
}: {
  href: string;
  children: ReactNode;
  /** Renders in brand colour even when inactive — used for "Sign in". */
  emphasis?: boolean;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex min-h-touch items-center rounded-lg border-b-2 px-3 py-2 text-base',
        active
          ? 'border-brand-600 font-semibold text-brand-700'
          : cn(
              'border-transparent hover:bg-ink-100',
              emphasis && 'font-medium text-brand-700',
            ),
      )}
    >
      {children}
    </Link>
  );
}
