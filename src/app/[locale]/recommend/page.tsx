import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getCurrentPerson } from '@/server/auth/session';
import { getCategoryGroups } from '@/server/services/category.service';
import { getPublicProfile } from '@/server/services/person.service';
import { canRecommend } from '@/server/domain/person/rules';
import { env } from '@/server/env';
import { RecommendForm } from '@/components/recommendations/recommend-form';
import { Card } from '@/components/ui/card';
import { PageGlow } from '@/components/ui/decor';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'recommendations' });
  return { title: t('title') };
}

export default async function RecommendPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const query = await searchParams;
  setRequestLocale(locale);

  const person = await getCurrentPerson();
  // next-intl's `redirect` throws, but its signature does not return `never`,
  // so the narrowing has to be made explicit for anything below it.
  if (!person) {
    redirect({ href: '/sign-in', locale });
    return null;
  }

  // The eligibility rule lives in the domain layer, so this page, the API and
  // a future bot all get the same answer. Checked here only to show a useful
  // message instead of letting the form fail on submit.
  if (!canRecommend(person)) {
    const t = await getTranslations('recommendations');
    return (
      <div className="mx-auto w-full max-w-md px-4 py-10">
        <Card>
          <p className="text-lg">{t('notVerifiedError')}</p>
        </Card>
      </div>
    );
  }

  // Arrived from a profile page: the subject is fixed by id and looked up
  // here, so the form shows a name and never a field for a phone number.
  // A subject that cannot be shown (missing, unlisted, or the referrer
  // themself) falls back to the open form rather than erroring.
  const subjectPublicId = typeof query.subject === 'string' ? query.subject : undefined;
  const subject =
    subjectPublicId && subjectPublicId !== person.publicId
      ? await getPublicProfile(subjectPublicId, person, locale)
          .then((profile) => ({ publicId: profile.publicId, displayName: profile.displayName }))
          .catch(() => undefined)
      : undefined;

  const categories = await getCategoryGroups(locale);

  return (
    <div className="relative mx-auto w-full max-w-md px-4 py-8">
      <PageGlow />
      <RecommendForm
        categories={categories}
        canRecommendNonUsers={env.ALLOW_RECOMMENDING_NON_USERS}
        subject={subject}
      />
    </div>
  );
}
