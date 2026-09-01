import type { NextRequest } from 'next/server';
import { LOCALE_COOKIE, routing, type Locale } from '@/i18n/routing';

/**
 * Which language should an API response be rendered in?
 *
 * Route Handlers sit outside the `[locale]` segment, so they cannot read the
 * locale from the URL the way a page does. Category and locality names are
 * stored bilingually and have to be resolved somewhere, so the client says
 * which one it wants.
 *
 * Resolution order, most explicit first:
 *   1. `?locale=` — a deliberate request, used by a native client or a bot
 *   2. the locale cookie next-intl already sets when the user switches
 *   3. `Accept-Language`
 *   4. the default (Malayalam)
 */
export function resolveLocale(request: NextRequest): Locale {
  const fromQuery = request.nextUrl.searchParams.get('locale');
  if (isSupported(fromQuery)) return fromQuery;

  const fromCookie = request.cookies.get(LOCALE_COOKIE)?.value;
  if (isSupported(fromCookie)) return fromCookie;

  const header = request.headers.get('accept-language');
  if (header) {
    for (const part of header.split(',')) {
      const tag = part.split(';')[0]?.trim().slice(0, 2).toLowerCase();
      if (isSupported(tag)) return tag;
    }
  }

  return routing.defaultLocale;
}

function isSupported(value: string | null | undefined): value is Locale {
  return (
    typeof value === 'string' && (routing.locales as readonly string[]).includes(value)
  );
}
