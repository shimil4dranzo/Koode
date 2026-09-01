import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { env } from '@/server/env';
import { getCurrentPerson } from '@/server/auth/session';
import {
  GOOGLE_STATE_COOKIE,
  buildAuthUrl,
  createState,
  isGoogleSsoEnabled,
  type GoogleMode,
} from '@/server/auth/google';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/google/start?mode=login|link — hand the browser to Google.
 *
 * `login` signs in a person who already attached Google to their account.
 * `link` attaches Google to the signed-in person, so it requires a session —
 * that ordering is the design: identity is established by phone first, Google
 * only ever rides on top of it.
 *
 * A plain full-page redirect, not a popup: popups die under mobile browsers'
 * blockers, and this is a phone-first product.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isGoogleSsoEnabled()) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', messageKey: 'errors.notFound' } },
      { status: 404 },
    );
  }

  const mode: GoogleMode =
    request.nextUrl.searchParams.get('mode') === 'link' ? 'link' : 'login';

  if (mode === 'link') {
    const person = await getCurrentPerson();
    if (!person) {
      return NextResponse.redirect(new URL('/sign-in', env.NEXT_PUBLIC_APP_URL));
    }
  }

  const state = createState(mode);
  const response = NextResponse.redirect(buildAuthUrl(state));

  response.cookies.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });

  return response;
}
