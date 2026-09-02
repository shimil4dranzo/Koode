import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TextField } from '@/components/ui/field';
import { SkillEditor } from '@/components/profile/skill-editor';
import { getCurrentPerson, getRequestMeta, requirePerson } from '@/server/auth/session';
import { updateProfileSchema } from '@/server/http/schemas';
import {
  getOwnEditableProfile,
  getPublicProfile,
  updateProfile,
} from '@/server/services/person.service';
import { getCategoryGroups } from '@/server/services/category.service';

/**
 * The first screen after sign-up.
 *
 * A seeker lands here with an empty profile and two minutes: one line about
 * their work, their qualification, and the kinds of work they do. That is the
 * whole of what an employer reads before deciding to call, so it is asked for
 * now, on one screen, with a skip for anyone who came to apply to one opening
 * and wants to get on with it.
 *
 * An employer lands here too, briefly: their account is ready, and the useful
 * next step is the posting form. Sending them through a profile form first
 * would be asking a shopkeeper for a headline before letting them say "counter
 * staff wanted".
 *
 * Step 2 of the launch plan's seven — "profile, or opening".
 */

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'onboarding' });
  return { title: t('title') };
}

async function saveBasics(formData: FormData): Promise<void> {
  'use server';

  const person = await requirePerson();
  const parsed = updateProfileSchema.safeParse({
    headline: String(formData.get('headline') ?? '') || null,
    education: String(formData.get('education') ?? '') || null,
  });
  const locale = String(formData.get('locale') ?? '');

  if (!parsed.success) {
    redirect({ href: '/profile/onboarding?invalid=1', locale });
    return;
  }

  await updateProfile(parsed.data, person, await getRequestMeta());
  // Back to this screen, not away from it: the skills editor below the form
  // is the second half of the job, and it saves on its own.
  redirect({ href: '/profile/onboarding?saved=1', locale });
}

export default async function OnboardingPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const person = await getCurrentPerson();
  if (!person) {
    redirect({ href: '/sign-in', locale });
    return null;
  }

  const [query, editable, profile, categoryGroups, t, tCommon, tErrors] = await Promise.all([
    searchParams,
    getOwnEditableProfile(person),
    getPublicProfile(person.publicId, person, locale),
    getCategoryGroups(locale),
    getTranslations('onboarding'),
    getTranslations('common'),
    getTranslations('errors'),
  ]);

  if (editable.accountType === 'employer') {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <Card>
          <h1 className="text-2xl font-semibold sm:text-3xl">{t('employerTitle')}</h1>
          <p className="mt-2 text-ink-700">{t('employerSubtitle')}</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/openings/new"
              className="inline-flex min-h-14 items-center justify-center rounded-lg bg-brand-600 px-6 text-lg font-medium text-white hover:bg-brand-700"
            >
              {t('postFirst')}
            </Link>
            <Link
              href="/profile/edit"
              className="inline-flex min-h-14 items-center justify-center rounded-lg border border-ink-300 bg-paper-raised px-6 text-lg font-medium hover:bg-ink-100"
            >
              {tCommon('edit')}
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold sm:text-3xl">{t('title')}</h1>
      <p className="mt-2 max-w-prose text-ink-700">{t('subtitle')}</p>

      {query.invalid ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-danger-600 bg-danger-100 px-4 py-3 text-danger-600"
        >
          {tErrors('validationFailed')}
        </p>
      ) : null}
      {query.saved ? (
        <p role="status" className="mt-4 rounded-lg border border-brand-600 bg-brand-100/50 px-4 py-3">
          {t('done')}
        </p>
      ) : null}

      <Card className="mt-6">
        <form action={saveBasics} className="flex flex-col gap-5">
          <input type="hidden" name="locale" value={locale} />

          <TextField
            label={t('headlineLabel')}
            name="headline"
            defaultValue={editable.headline ?? ''}
            placeholder={t('headlinePlaceholder')}
            maxLength={200}
            autoFocus
          />

          <TextField
            label={t('educationLabel')}
            name="education"
            defaultValue={editable.education ?? ''}
            placeholder={t('educationPlaceholder')}
            help={t('educationHelp')}
            maxLength={200}
          />

          <Button type="submit" size="lg">
            {tCommon('save')}
          </Button>
        </form>
      </Card>

      <Card className="mt-4">
        <p className="text-ink-700">{t('skillsHint')}</p>
        <div className="mt-3">
          <SkillEditor skills={profile.skills} categoryGroups={categoryGroups} />
        </div>
      </Card>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/profile"
          className="inline-flex min-h-14 items-center justify-center rounded-lg bg-brand-600 px-6 text-lg font-medium text-white hover:bg-brand-700"
        >
          {t('save')}
        </Link>
        <Link
          href="/openings"
          className="inline-flex min-h-14 items-center justify-center rounded-lg border border-ink-300 bg-paper-raised px-6 text-lg font-medium hover:bg-ink-100"
        >
          {t('skip')}
        </Link>
      </div>
    </div>
  );
}
