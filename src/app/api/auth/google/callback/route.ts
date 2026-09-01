import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { env } from '@/server/env';
import { LOCALE_COOKIE, routing } from '@/i18n/routing';
import { createSession, getCurrentPerson } from '@/server/auth/session';
import { readMeta } from '@/server/http/request';
import { AUDIT_ACTIONS, recordAudit, recordAuditSafely } from '@/server/audit';
import {
  GOOGLE_STATE_COOKIE,
  exchangeAndVerify,
  isGoogleSsoEnabled,
  verifyState,
} from '@/server/auth/google';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/google/callback — where Google sends the browser back.
 *
 * Every failure lands the user on a page with a translated explanation,
 * never a JSON blob: whatever went wrong, the person is mid-navigation in a
 * browser tab, not a client parsing an API.
 *
 * The invariant enforced here is the one the whole feature is scoped around:
 * a Google account that is not attached to an existing phone-verified profile
 * cannot get in and cannot create one. `login` with an unknown account
 * redirects to sign-in with an explanation; only `link` — which requires a
 * live session — ever writes a googleSub.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const locale = localeOf(request);
  const failTo = (path: string, error: string): NextResponse =>
    redirectTo(request, `/${locale}${path}?error=${error}`);

  if (!isGoogleSsoEnabled()) return failTo('/sign-in', 'googleFailed');

  const mode = verifyState(
    request.nextUrl.searchParams.get('state'),
    request.cookies.get(GOOGLE_STATE_COOKIE)?.value,
  );
  const code = request.nextUrl.searchParams.get('code');

  // A denied consent screen, a tampered state, a replay — all one outcome.
  if (!mode || !code) return failTo('/sign-in', 'googleFailed');

  let identity;
  try {
    identity = await exchangeAndVerify(code);
  } catch {
    return failTo('/sign-in', 'googleFailed');
  }

  const meta = readMeta(request);

  if (mode === 'link') {
    const person = await getCurrentPerson();
    if (!person) return failTo('/sign-in', 'googleFailed');

    const holder = await prisma.person.findUnique({
      where: { googleSub: identity.sub },
      select: { id: true },
    });
    if (holder && holder.id !== person.id) {
      // One Google account, one profile — otherwise "Continue with Google"
      // would have to guess which person to become.
      return failTo('/profile', 'googleTaken');
    }

    await prisma.$transaction(async (tx) => {
      await tx.person.update({
        where: { id: person.id },
        data: { googleSub: identity.sub, email: identity.email },
      });
      await recordAudit(
        {
          action: AUDIT_ACTIONS.GOOGLE_LINKED,
          actorPersonId: person.id,
          entityType: 'person',
          entityId: person.publicId,
          context: meta,
        },
        tx,
      );
    });

    return redirectTo(request, `/${locale}/profile?linked=google`);
  }

  // mode === 'login'
  const person = await prisma.person.findUnique({
    where: { googleSub: identity.sub },
    select: { id: true, publicId: true, status: true, anonymizedAt: true },
  });

  if (!person || person.anonymizedAt) {
    return failTo('/sign-in', 'googleNotLinked');
  }
  if (person.status !== 'active') {
    return failTo('/sign-in', 'accountSuspended');
  }

  await createSession(person.id, meta);
  await recordAuditSafely({
    action: AUDIT_ACTIONS.PERSON_SIGNED_IN,
    actorPersonId: person.id,
    entityType: 'person',
    entityId: person.publicId,
    metadata: { method: 'google' },
    context: meta,
  });

  return redirectTo(request, `/${locale}`);
}

/** The locale the person was browsing in, so redirects keep their language. */
function localeOf(request: NextRequest): string {
  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  return cookie && (routing.locales as readonly string[]).includes(cookie)
    ? cookie
    : routing.defaultLocale;
}

/** Redirect that also clears the one-shot state cookie. */
function redirectTo(request: NextRequest, path: string): NextResponse {
  const response = NextResponse.redirect(new URL(path, env.NEXT_PUBLIC_APP_URL));
  if (request.cookies.get(GOOGLE_STATE_COOKIE)) {
    response.cookies.delete(GOOGLE_STATE_COOKIE);
  }
  return response;
}
