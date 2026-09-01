import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Card } from '@/components/ui/card';

/**
 * Reached both by a genuinely unknown URL and by `notFound()` from a page —
 * including the case where somebody follows a link to a profile that is
 * `pending_claim` or suspended. That is deliberate: a 404 for a hidden profile
 * gives away nothing, whereas "this person exists but is not visible" would.
 */
export default async function LocaleNotFound() {
  const [t, tNav] = await Promise.all([
    getTranslations('errors'),
    getTranslations('nav'),
  ]);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12">
      <Card>
        <h1 className="text-xl font-semibold">{t('notFoundTitle')}</h1>
        <p className="mt-2 text-ink-700">{t('notFoundBody')}</p>

        <Link
          href="/"
          className="mt-5 inline-flex min-h-touch items-center rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-700"
        >
          {tNav('home')}
        </Link>
      </Card>
    </div>
  );
}
