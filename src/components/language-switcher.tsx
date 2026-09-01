'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useTransition } from 'react';
import { LOCALE_LABELS, routing, type Locale } from '@/i18n/routing';
import { usePathname, useRouter } from '@/i18n/navigation';

/**
 * Language toggle.
 *
 * A plain <select> rather than a custom menu: it opens the Android picker,
 * which is easier to hit and already accessible. Each language is named in its
 * own script, because someone looking for Malayalam is looking for "മലയാളം".
 *
 * This is one of the very few Client Components in the app — it needs the
 * current pathname and router to switch locale without losing the page.
 */
export function LanguageSwitcher() {
  const t = useTranslations('a11y');
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <label className="inline-flex items-center">
      <span className="sr-only-focusable absolute">{t('changeLanguage')}</span>
      <select
        aria-label={t('changeLanguage')}
        value={locale}
        disabled={isPending}
        onChange={(event) => {
          const next = event.target.value as Locale;
          startTransition(() => {
            // `params` carries any dynamic segments of the current route so the
            // user stays on the same page in the other language.
            router.replace(
              // @ts-expect-error -- pathname and params are correlated at
              // runtime but next-intl cannot prove it for a dynamic route.
              { pathname, params },
              { locale: next },
            );
          });
        }}
        className="min-h-touch rounded-lg border border-ink-300 bg-paper-raised px-3 py-2 text-base"
      >
        {routing.locales.map((code) => (
          <option key={code} value={code}>
            {LOCALE_LABELS[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
