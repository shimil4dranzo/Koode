import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getCurrentPerson } from '@/server/auth/session';
import { getCategoryGroups } from '@/server/services/category.service';
import { getOwnAccountEmail } from '@/server/services/person.service';
import { getLocalityOptions } from '@/server/services/locality.service';
import { PostRequirementForm } from '@/components/requirements/post-requirement-form';

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'requirements' });
  return { title: t('postTitle') };
}

export default async function NewRequirementPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const person = await getCurrentPerson();
  // next-intl's redirect throws but is not typed `never`; narrow explicitly.
  if (!person) {
    redirect({ href: '/sign-in', locale });
    return null;
  }

  // Both lists are fetched here rather than in the form so the pickers are in
  // the first response: the brief asks posting to take under a minute, and a
  // form that cannot be filled in until two more requests land does not.
  const [localities, categoryGroups, accountEmail] = await Promise.all([
    getLocalityOptions(locale),
    getCategoryGroups(locale),
    // Only read when it will actually be used as a prefill.
    person.hasContactEmail ? Promise.resolve('') : getOwnAccountEmail(person),
  ]);

  return <PostRequirementForm
      localities={localities}
      categoryGroups={categoryGroups}
      needsContactPhone={!person.hasContactPhone}
      needsContactEmail={!person.hasContactEmail}
      accountEmail={accountEmail}
    />;
}
