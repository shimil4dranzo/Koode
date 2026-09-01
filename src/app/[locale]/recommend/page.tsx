import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getCurrentPerson } from '@/server/auth/session';
import { getCategoryGroups } from '@/server/services/category.service';
import { canRecommend } from '@/server/domain/person/rules';
import { env } from '@/server/env';
import { RecommendForm } from '@/components/recommendations/recommend-form';
import { Card } from '@/components/ui/card';
import { PageGlow } from '@/components/ui/decor';

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'recommendations' });
  return { title: t('title') };
}

export default async function RecommendPage({ params }: PageProps) {
  const { locale } = await params;
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

  const categories = await getCategoryGroups(locale);

  return (
    <div className="relative mx-auto w-full max-w-md px-4 py-8">
      <PageGlow />
      <RecommendForm
        categories={categories}
        canRecommendNonUsers={env.ALLOW_RECOMMENDING_NON_USERS}
      />
    </div>
  );
}
