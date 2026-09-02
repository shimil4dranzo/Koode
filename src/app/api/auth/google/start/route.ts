import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { env } from '@/server/env';
import { getCurrentPerson } from '@/server/auth/session';
import { safeNextPath } from '@/server/http/next-path';
import {
  GOOGLE_STATE_COOKIE,
  buildAuthUrl,
  createState,
  isGoogleSsoEnabled,
  type GoogleMode,
  GOOGLE_INTENT_COOKIE,
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

  // What the person came for survives the round trip through Google in a
  // cookie of its own, not in the signed state: the state's job is CSRF
  // binding and its format is tested to the character. `role` pre-selects the
  // sign-up chooser; `next` is where they were headed. Both are re-validated
  // on the way back, so the cookie is a hint, never an instruction.
  const role = request.nextUrl.searchParams.get('role');
  const next = safeNextPath(request.nextUrl.searchParams.get('next') ?? undefined);
  const intent = [role === 'employer' ? 'employer' : role === 'seeker' ? 'seeker' : '', next ?? ''].join('|');
  if (intent !== '|') {
    response.cookies.set(GOOGLE_INTENT_COOKIE, intent, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
    });
  }

  response.cookies.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });

  return response;
}
