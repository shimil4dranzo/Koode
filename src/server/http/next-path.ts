/**
 * Validate a `next` parameter down to a same-site path.
 *
 * Anything that could leave the site is dropped rather than "fixed": a
 * protocol, a double slash (which browsers read as protocol-relative), a
 * backslash, or a path that does not start with `/`. The sign-in page sends
 * people wherever this returns, so this is the one place an open redirect
 * would have to get past.
 */
export function safeNextPath(raw: string | string[] | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || value.length > 500) return undefined;
  if (!value.startsWith('/')) return undefined;
  if (value.startsWith('//') || value.includes('\\') || value.includes('://')) return undefined;
  return value;
}
