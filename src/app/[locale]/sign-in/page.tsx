import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getCurrentPerson } from '@/server/auth/session';
import { cookies } from 'next/headers';
import {
  GOOGLE_SIGNUP_COOKIE,
  isGoogleSsoEnabled,
  readSignupTicket,
} from '@/server/auth/google';
import { getLocalityOptions } from '@/server/services/locality.service';
import { SignInFlow } from '@/components/auth/sign-in-flow';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * The OAuth callback can only communicate through a redirect, so its failures
 * arrive here as ?error=… — mapped to known keys and never echoed verbatim.
 */
const OAUTH_ERROR_KEYS: Record<string, string> = {
  googleNotLinked: 'googleNotLinked',
  googleFailed: 'googleFailed',
  accountSuspended: 'accountSuspendedNotice',
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return { title: t('signInTitle') };
}

export default async function SignInPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const person = await getCurrentPerson();
  if (person) redirect({ href: '/', locale });

  const query = await searchParams;
  const requestedError = typeof query.error === 'string' ? query.error : undefined;

  // A Google sign-up ticket set by the OAuth callback jumps this page
  // straight to the completion step. Read server-side: the cookie is
  // httpOnly, and only the name and e-mail cross to the client.
  const ticket = readSignupTicket((await cookies()).get(GOOGLE_SIGNUP_COOKIE)?.value);

  // Fetched on the server so the locality list costs no client JavaScript and
  // no extra round trip on a slow connection.
  const localities = await getLocalityOptions(locale).catch(() => []);

  return (
    <SignInFlow
      localities={localities}
      googleEnabled={isGoogleSsoEnabled()}
      googleDraft={ticket ? { name: ticket.name, email: ticket.email } : undefined}
      initialErrorKey={requestedError ? OAUTH_ERROR_KEYS[requestedError] : undefined}
    />
  );
}
