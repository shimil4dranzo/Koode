import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export async function SiteFooter() {
  const t = await getTranslations('app');

  return (
    <footer className="mt-10 border-t border-ink-200 bg-paper-raised">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 text-sm text-ink-700">
        <p className="font-medium text-ink-900">{t('tagline')}</p>
        <p className="mt-1">{t('byline')}</p>
        <nav className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/privacy" className="underline underline-offset-2">
            {t('privacyLink')}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
