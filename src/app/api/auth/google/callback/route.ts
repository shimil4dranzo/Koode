import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { env } from '@/server/env';
import { LOCALE_COOKIE, routing } from '@/i18n/routing';
import { createSession, getCurrentPerson } from '@/server/auth/session';
import { readMeta } from '@/server/http/request';
import { safeNextPath } from '@/server/http/next-path';
import { AUDIT_ACTIONS, recordAudit, recordAuditSafely } from '@/server/audit';
import {
  GOOGLE_SIGNUP_COOKIE,
  GOOGLE_INTENT_COOKIE,
  GOOGLE_STATE_COOKIE,
  createSignupTicket,
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
 * Three outcomes for `login`: a known googleSub signs straight in; a
 * verified-email match attaches Google to that existing account and signs in;
 * anything else becomes a sign-up ticket and a completion screen — an account
 * is only ever created after consent is shown and accepted there.
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
  let person = await prisma.person.findUnique({
    where: { googleSub: identity.sub },
    select: { id: true, publicId: true, status: true, anonymizedAt: true },
  });

  if (!person) {
    // Same address, password account: attach the Google credential rather
    // than minting a duplicate person. Safe because Google asserted
    // email_verified — without that flag this branch would let anyone claim
    // an account by registering its address at Google.
    const byEmail = await prisma.person.findUnique({
      where: { email: identity.email },
      select: { id: true, publicId: true, status: true, anonymizedAt: true },
    });

    if (byEmail && !byEmail.anonymizedAt) {
      await prisma.$transaction(async (tx) => {
        await tx.person.update({
          where: { id: byEmail.id },
          data: { googleSub: identity.sub },
        });
        await recordAudit(
          {
            action: AUDIT_ACTIONS.GOOGLE_LINKED,
            actorPersonId: byEmail.id,
            entityType: 'person',
            entityId: byEmail.publicId,
            metadata: { via: 'verified_email_match' },
            context: meta,
          },
          tx,
        );
      });
      person = byEmail;
    }
  }

  if (!person || person.anonymizedAt) {
    // First time here: park the verified identity and collect name + consent
    // on the completion screen. No account exists until that is accepted.
    const intent = readIntent(request);
    const params = new URLSearchParams({ google: 'new' });
    if (intent.role) params.set('role', intent.role);
    if (intent.next) params.set('next', intent.next);
    const response = redirectTo(request, `/${locale}/sign-in?${params.toString()}`);
    response.cookies.delete(GOOGLE_INTENT_COOKIE);
    response.cookies.set(GOOGLE_SIGNUP_COOKIE, createSignupTicket(identity), {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 900,
    });
    return response;
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

  const intent = readIntent(request);
  const response = redirectTo(request, intent.next ?? `/${locale}`);
  response.cookies.delete(GOOGLE_INTENT_COOKIE);
  return response;
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

/** The role and next-path hint set by /start, re-validated here. */
function readIntent(request: NextRequest): { role: 'seeker' | 'employer' | null; next: string | undefined } {
  const raw = request.cookies.get(GOOGLE_INTENT_COOKIE)?.value ?? '';
  const [role, next] = raw.split('|');
  return {
    role: role === 'employer' || role === 'seeker' ? role : null,
    next: safeNextPath(next || undefined),
  };
}
