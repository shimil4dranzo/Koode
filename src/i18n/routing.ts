import { defineRouting } from 'next-intl/routing';

/**
 * Malayalam is the default because the users are in Edakkara, not because the
 * developers are. English is a first-class alternative, not a fallback.
 *
 * PRODUCT DECISION PENDING CONFIRMATION (ARCHITECTURE.md §Open decisions):
 * whether an unrecognised visitor should land on Malayalam or English.
 *
 * `localePrefix: 'always'` keeps every URL unambiguous — /ml/jobs and
 * /en/jobs. The alternative ('as-needed') gives the default locale bare URLs,
 * which then breaks confusingly the day the default changes, and makes a
 * shared link's language depend on who shared it.
 */
export const routing = defineRouting({
  locales: ['ml', 'en'],
  defaultLocale: 'ml',
  localePrefix: 'always',
  localeCookie: {
    name: 'KOODE_LOCALE',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  },
});

export type Locale = (typeof routing.locales)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  // Each language is named in itself — a user looking for Malayalam is looking
  // for "മലയാളം", not for the word "Malayalam" written in Latin script.
  ml: 'മലയാളം',
  en: 'English',
};
