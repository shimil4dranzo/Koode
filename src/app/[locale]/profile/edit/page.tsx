import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SelectField, TextField } from '@/components/ui/field';
import { SkillEditor } from '@/components/profile/skill-editor';
import { getCurrentPerson, getRequestMeta, requirePerson } from '@/server/auth/session';
import { updateProfileSchema } from '@/server/http/schemas';
import { getOwnEditableProfile, getPublicProfile, updateProfile } from '@/server/services/person.service';
import { getCategoryGroups } from '@/server/services/category.service';
import { getLocalityOptions } from '@/server/services/locality.service';

/**
 * Editing your own details.
 *
 * The three profile fields are a plain form driven by a Server Action, so they
 * save on a phone that has not finished downloading JavaScript. Skills are the
 * one part that genuinely needs a client component: adding three of them
 * should be three taps on one screen rather than three page loads.
 */

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'profile' });
  return { title: t('editTitle') };
}

/**
 * Saving.
 *
 * Validation failure comes back as a query flag rather than a thrown error:
 * an over-long headline is the user mistyping, and throwing would replace the
 * form with the error page and lose everything else they had entered. The
 * schema is the same one the Route Handler uses, so both paths accept exactly
 * the same input.
 */
async function saveProfile(formData: FormData): Promise<void> {
  'use server';

  const person = await requirePerson();

  const parsed = updateProfileSchema.safeParse({
    displayName: String(formData.get('displayName') ?? ''),
    localityPublicId: String(formData.get('localityPublicId') ?? '') || null,
    headline: String(formData.get('headline') ?? '') || null,
    education: String(formData.get('education') ?? '') || null,
  });

  const locale = String(formData.get('locale') ?? '');

  if (!parsed.success) {
    redirect({ href: '/profile/edit?invalid=1', locale });
    return;
  }

  await updateProfile(parsed.data, person, await getRequestMeta());

  redirect({ href: '/profile?saved=1', locale });
}

export default async function EditProfilePage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const person = await getCurrentPerson();
  // next-intl's `redirect` throws, but its signature does not return `never`,
  // so the narrowing has to be made explicit for anything below it.
  if (!person) {
    redirect({ href: '/sign-in', locale });
    return null;
  }

  const [query, editable, profile, localities, categoryGroups, t, tCommon, tErrors, tOnboarding] =
    await Promise.all([
      searchParams,
      getOwnEditableProfile(person),
      getPublicProfile(person.publicId, person, locale),
      getLocalityOptions(locale),
      getCategoryGroups(locale),
      getTranslations('profile'),
      getTranslations('common'),
      getTranslations('errors'),
      getTranslations('onboarding'),
    ]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold sm:text-3xl">{t('editTitle')}</h1>

      {query.invalid ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-danger-600 bg-danger-100 px-4 py-3 text-danger-600"
        >
          {tErrors('validationFailed')}
        </p>
      ) : null}

      <Card className="mt-6">
        <form action={saveProfile} className="flex flex-col gap-5">
          {/* The action runs outside the [locale] segment's request context,
              so the language it should redirect back into travels with it. */}
          <input type="hidden" name="locale" value={locale} />

          <TextField
            label={t('nameLabel')}
            name="displayName"
            defaultValue={editable.displayName}
            autoComplete="name"
            maxLength={120}
            required
          />

          <SelectField
            label={t('localityLabel')}
            name="localityPublicId"
            placeholder={tCommon('none')}
            defaultValue={editable.localityPublicId ?? ''}
            options={localities.map((locality) => ({
              value: locality.publicId,
              label: locality.label,
            }))}
          />

          <TextField
            label={t('headlineLabel')}
            name="headline"
            defaultValue={editable.headline ?? ''}
            placeholder={t('headlinePlaceholder')}
            maxLength={200}
          />

          <TextField
            label={t('educationLabel')}
            name="education"
            defaultValue={editable.education ?? ''}
            placeholder={tOnboarding('educationPlaceholder')}
            help={tOnboarding('educationHelp')}
            maxLength={200}
          />

          <Button type="submit" size="lg">
            {tCommon('save')}
          </Button>
        </form>
      </Card>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">{t('skillsLabel')}</h2>
        <div className="mt-3">
          <SkillEditor skills={profile.skills} categoryGroups={categoryGroups} />
        </div>
      </section>

      <p className="mt-8">
        <Link href="/profile" className="underline underline-offset-2">
          {tCommon('back')}
        </Link>
      </p>
    </div>
  );
}
