import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from '@/components/language-switcher';
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
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <Link href="/" className="flex flex-col leading-tight">
          <span className="text-xl font-semibold text-brand-700">{tApp('name')}</span>
        </Link>

        <div className="ms-auto">
          <LanguageSwitcher />
        </div>

        <nav
          aria-label={tNav('menu')}
          className="flex w-full items-center gap-1 sm:w-auto sm:order-first sm:ms-auto"
        >
          <Link
            href="/openings"
            className="inline-flex min-h-touch items-center rounded-lg px-3 py-2 text-base hover:bg-ink-100"
          >
            {tNav('openings')}
          </Link>

          {person ? (
            <Link
              href="/profile"
              className="inline-flex min-h-touch items-center rounded-lg px-3 py-2 text-base hover:bg-ink-100"
            >
              {tNav('profile')}
            </Link>
          ) : (
            <Link
              href="/sign-in"
              className="inline-flex min-h-touch items-center rounded-lg px-3 py-2 text-base font-medium text-brand-700 hover:bg-ink-100"
            >
              {tNav('signIn')}
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
