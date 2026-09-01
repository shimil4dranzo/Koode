import createMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { routing } from '@/i18n/routing';

const handleI18n = createMiddleware(routing);

/**
 * Content-Security-Policy.
 *
 * A per-request nonce is required because Next injects its own inline
 * bootstrap scripts; without one we would have to allow 'unsafe-inline',
 * which defeats the purpose. `strict-dynamic` lets those trusted scripts load
 * the chunks they need without us enumerating every hashed filename.
 *
 * There are no third-party origins in this list on purpose: Section 6 forbids
 * trackers and off-platform analytics, and the CSP is what makes that a
 * technical guarantee rather than a promise.
 */
function contentSecurityPolicy(nonce: string, isDev: boolean): string {
  const scriptSrc = isDev
    ? // React Refresh evaluates code at runtime; this relaxation is
      // development-only and never reaches a deployed build.
      `'self' 'nonce-${nonce}' 'unsafe-eval' 'unsafe-inline'`
    : `'self' 'nonce-${nonce}' 'strict-dynamic'`;

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    // Tailwind emits a stylesheet, but Next still inlines a few style
    // attributes; 'unsafe-inline' for styles cannot execute code.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    `connect-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `manifest-src 'self'`,
    `worker-src 'self'`,
    isDev ? '' : 'upgrade-insecure-requests',
  ]
    .filter(Boolean)
    .join('; ');
}

/**
 * Cross-site request forgery protection for cookie-authenticated mutations.
 *
 * The session cookie is SameSite=Lax, which already blocks cross-site POSTs
 * from a form or a link. This is the second layer: compare the Origin header
 * against the host actually being served. Requests with no Origin at all are
 * allowed through only for safe methods — a browser always sends Origin on a
 * cross-origin write, and a native client that sends none is not a CSRF risk
 * because it does not carry the user's cookies implicitly.
 */
function isCrossSiteWrite(request: NextRequest): boolean {
  const method = request.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return false;

  const origin = request.headers.get('origin');
  if (!origin) return false;

  try {
    const originHost = new URL(origin).host;
    const target = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
    return originHost !== target;
  } catch {
    return true;
  }
}

/**
 * Next 16 renamed the `middleware` file convention to `proxy`. Same execution
 * model, same matcher semantics — only the filename and export name changed.
 */
export default function proxy(request: NextRequest): NextResponse {
  const isDev = process.env.NODE_ENV === 'development';

  if (isCrossSiteWrite(request)) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', messageKey: 'errors.notAllowed' } },
      { status: 403 },
    );
  }

  const nonce = crypto.randomUUID().replace(/-/g, '');
  const csp = contentSecurityPolicy(nonce, isDev);

  // Route Handlers are the API surface and must not be locale-prefixed or
  // redirected; only pages go through the i18n middleware.
  const isApiRoute = request.nextUrl.pathname.startsWith('/api');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  // Next reads the CSP off the request to attach the nonce to its own scripts.
  requestHeaders.set('content-security-policy', csp);

  const response = isApiRoute
    ? NextResponse.next({ request: { headers: requestHeaders } })
    : handleI18n(request);

  response.headers.set('content-security-policy', csp);
  response.headers.set('x-nonce', nonce);

  return response;
}

export const config = {
  matcher: [
    // Everything except Next internals and static files, which need neither a
    // locale nor a nonce.
    '/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|offline.html|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml)$).*)',
  ],
};
