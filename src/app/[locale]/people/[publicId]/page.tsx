import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { RecommendationList } from '@/components/profile/recommendation-list';
import { getCurrentPerson } from '@/server/auth/session';
import { isAppError } from '@/server/errors';
import { getPublicProfile, type PublicProfile } from '@/server/services/person.service';

/**
 * Somebody else's profile.
 *
 * The recommendations come first, before the skill list and before anything
 * else this person has said about themselves. That ordering is the product:
 * an employer deciding whether to call is buying the word of a named local
 * person, and the self-description is only context for it.
 *
 * No phone number appears here. Reaching this person goes through a posting
 * and the audited reveal, never through their profile.
 */

type PageProps = { params: Promise<{ locale: string; publicId: string }> };

/**
 * `generateMetadata` and the page body both need the profile. React's `cache`
 * makes that one query per request rather than two.
 */
const loadProfile = cache(
  async (publicId: string, locale: string): Promise<PublicProfile> =>
    getPublicProfile(publicId, await getCurrentPerson(), locale),
);

/**
 * A profile that does not exist, one still waiting to be claimed, and one a
 * moderator has suspended must all render as the same 404. The service already
 * refuses to distinguish them, because "this person exists but is hidden" is
 * itself a disclosure.
 */
async function loadOrNotFound(publicId: string, locale: string): Promise<PublicProfile> {
  try {
    return await loadProfile(publicId, locale);
  } catch (error) {
    if (isAppError(error) && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, publicId } = await params;
  const profile = await loadOrNotFound(publicId, locale);
  return { title: profile.displayName };
}

export default async function PersonPage({ params }: PageProps) {
  const { locale, publicId } = await params;
  setRequestLocale(locale);

  const [profile, viewer, t, tCommon, tAnchor] = await Promise.all([
    loadOrNotFound(publicId, locale),
    getCurrentPerson(),
    getTranslations('profile'),
    getTranslations('common'),
    getTranslations('anchor'),
  ]);

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="flex flex-wrap items-center gap-x-3 gap-y-2 text-2xl font-semibold sm:text-3xl">
        {profile.displayName}
        {profile.isVerifiedMember ? (
          <Badge tone="verified" glyph="✓">
            {tAnchor('verified')}
          </Badge>
        ) : null}
      </h1>

      {profile.localityLabel ? (
        <p className="mt-2 text-lg text-ink-700">{profile.localityLabel}</p>
      ) : null}

      {profile.headline ? <p className="mt-2 text-ink-900">{profile.headline}</p> : null}
      {profile.education ? (
        <p className="mt-1 text-ink-700">
          <span className="font-medium text-ink-900">{t('educationLabel')}:</span>{' '}
          {profile.education}
        </p>
      ) : null}

      {profile.memberOf.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1 text-sm text-ink-700">
          {profile.memberOf.map((org) => (
            <li key={org}>{t('verifiedMember', { org })}</li>
          ))}
        </ul>
      ) : null}

      {profile.skills.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {profile.skills.map((skill) => (
            <li key={skill.categoryPublicId}>
              <Badge>
                {skill.label}
                {skill.yearsExperience === null
                  ? null
                  : ` · ${t('yearsCount', { count: skill.yearsExperience })}`}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}

      {/* The point of the page. */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold">{t('recommendationsTitle')}</h2>

        {profile.recommendations.length === 0 ? (
          <p className="mt-2 text-ink-700">{t('noRecommendations')}</p>
        ) : (
          <div className="mt-3">
            <RecommendationList recommendations={profile.recommendations} />
          </div>
        )}
      </section>

      {/*
        The one action a visitor can take on somebody's profile: put their
        name to it. It leads to the recommend form with this person fixed as
        the subject, so no phone number is ever typed for them. Signed-out
        visitors are sent to sign in and straight back here.
      */}
      {!profile.isSelf ? (
        <div className="mt-6 rounded-2xl border border-brand-600/40 bg-brand-100/40 p-4">
          <p className="font-medium">{t('vouchHint')}</p>
          <Link
            href={
              viewer
                ? `/recommend?subject=${profile.publicId}`
                : `/sign-in?next=${encodeURIComponent(`/${locale}/people/${profile.publicId}`)}`
            }
            className="mt-3 inline-flex min-h-touch items-center gap-2 rounded-lg bg-brand-600 px-5 font-medium text-white hover:bg-brand-700"
          >
            {t('vouchAction')}
          </Link>
        </div>
      ) : null}

      {profile.isSelf ? (
        <p className="mt-8">
          <Link href="/profile" className="underline underline-offset-2">
            {t('myTitle')}
          </Link>
        </p>
      ) : (
        <p className="mt-8">
          <Link href="/openings" className="underline underline-offset-2">
            {tCommon('back')}
          </Link>
        </p>
      )}
    </article>
  );
}
