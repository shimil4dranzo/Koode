import { routing } from '@/i18n/routing';

/**
 * Remove a leading locale segment from a site path.
 *
 * `next` parameters and OAuth return paths are full site paths — `/en/...` —
 * because the server validates and redirects them as-is. next-intl's `Link`,
 * `redirect` and `useRouter`, however, take *unprefixed* paths and add the
 * locale themselves. Handing them a prefixed path produced `/en/en/...`, a
 * 404, on the very first sign-up that used a return path. This is the seam
 * between the two conventions, kept in one place.
 */
export function stripLocale(path: string | undefined, locale: string): string | undefined {
  if (!path) return undefined;
  const locales: readonly string[] = routing.locales;
  const match = /^\/([^/?#]+)(?=[/?#]|$)/.exec(path);
  if (match && (match[1] === locale || locales.includes(match[1] ?? ''))) {
    const rest = path.slice(match[0].length);
    return rest.length === 0 || rest.startsWith('?') || rest.startsWith('#') ? `/${rest}` : rest;
  }
  return path;
}
