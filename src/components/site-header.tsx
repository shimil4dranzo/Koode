import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from '@/components/language-switcher';
import { LogoMark } from '@/components/logo';
import { NavLink } from '@/components/nav-link';
import { getCurrentPerson } from '@/server/auth/session';

/**
 * Site header. A Server Component: it reads the session on the server and
 * ships no JavaScript except the language switcher.
 */
export async function SiteHeader() {
  const [tNav, tApp] = await Promise.all([
    getTranslations('nav'),
    getTranslations('app'),
  ]);
  const person = await getCurrentPerson();

  return (
    <header className="border-b border-ink-200 bg-paper-raised">
      {/*
        Two rows on a narrow screen, one on a wide one.

        Malayalam labels are considerably longer than their English
        equivalents — "പ്രവേശിക്കുക" against "Sign in" — and a single row sized
        against English clips the language switcher off the right edge at
        360px. Wrapping is the fix rather than shrinking the text, because
        these labels are already at the minimum comfortable reading size.
      */}
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <LogoMark className="size-9" />
          <span className="text-xl font-semibold text-brand-700">{tApp('name')}</span>
        </Link>

        {/* Mobile: switcher shares the first row with the logo and the nav
            wraps beneath. Desktop: one row, logo left, nav pushed right,
            switcher last — the order-first trick from before the logo existed
            was parking the brand in the middle of the bar. */}
        <div className="ms-auto sm:order-2 sm:ms-0">
          <LanguageSwitcher />
        </div>

        <nav
          aria-label={tNav('menu')}
          className="flex w-full items-center gap-1 sm:order-1 sm:ms-auto sm:w-auto"
        >
          <NavLink href="/openings">{tNav('openings')}</NavLink>

          {person ? (
            <NavLink href="/profile">{tNav('profile')}</NavLink>
          ) : (
            <NavLink href="/sign-in" emphasis>
              {tNav('signIn')}
            </NavLink>
          )}
        </nav>
      </div>
    </header>
  );
}
