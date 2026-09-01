import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getCurrentPerson } from '@/server/auth/session';
import { getLocalityOptions } from '@/server/services/locality.service';
import { SignInFlow } from '@/components/auth/sign-in-flow';

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return { title: t('signInTitle') };
}

export default async function SignInPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const person = await getCurrentPerson();
  if (person) redirect({ href: '/', locale });

  // Fetched on the server so the locality list costs no client JavaScript and
  // no extra round trip on a slow connection.
  const localities = await getLocalityOptions(locale).catch(() => []);

  return <SignInFlow localities={localities} />;
}
