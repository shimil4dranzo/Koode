import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RecommendationList } from '@/components/profile/recommendation-list';
import { DangerZone } from '@/components/profile/danger-zone';
import { getCurrentPerson } from '@/server/auth/session';
import { canModerate } from '@/server/domain/person/rules';
import { getPublicProfile } from '@/server/services/person.service';
import { listOwnInterests } from '@/server/services/interest.service';
import { listOwnRequirements } from '@/server/services/requirement.service';

/**
 * The signed-in person's own page.
 *
 * Everything they have on Koode in one scroll: how they appear to an employer,
 * what has been said about them, where they have raised their hand, what they
 * have posted, and — at the bottom, not buried in a settings menu — the two
 * rights the DPDP Act gives them over all of it.
 *
 * No phone number appears anywhere on this page, not even their own. The
 * number is in the export, which is a deliberate, audited act.
 */

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'profile' });
  return { title: t('myTitle') };
}

const LINK_CLASSES =
  'inline-flex min-h-touch items-center justify-center rounded-lg border border-ink-300 bg-paper-raised px-4 py-2.5 font-medium hover:bg-ink-100';

export default async function ProfilePage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const person = await getCurrentPerson();
  // next-intl's `redirect` throws, but its signature does not return `never`,
  // so the narrowing has to be made explicit for anything below it.
  if (!person) {
    redirect({ href: '/sign-in', locale });
    return null;
  }

  const [
    query,
    profile,
    interests,
    postings,
    t,
    tCommon,
    tNav,
    tAnchor,
    tInterest,
    tRequirements,
    format,
  ] = await Promise.all([
    searchParams,
    getPublicProfile(person.publicId, person, locale),
    listOwnInterests(person, locale),
    listOwnRequirements(person, locale),
    getTranslations('profile'),
    getTranslations('common'),
    getTranslations('nav'),
    getTranslations('anchor'),
    getTranslations('interest'),
    getTranslations('requirements'),
    getFormatter(),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      {query.saved ? (
        <p role="status" className="mb-4 rounded-lg border border-brand-600 bg-brand-100 px-4 py-3 text-brand-700">
          {t('saved')}
        </p>
      ) : null}

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

      {profile.memberOf.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1 text-sm text-ink-700">
          {profile.memberOf.map((org) => (
            <li key={org}>{t('verifiedMember', { org })}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/profile/edit" className={LINK_CLASSES}>
          {tCommon('edit')}
        </Link>
        {/* Seeing your own public page is the only way to check what an
            employer actually sees, which is not the same as this page. */}
        <Link href={`/people/${profile.publicId}`} className={LINK_CLASSES}>
          {t('viewPublic')}
        </Link>
        {canModerate(person) ? (
          <Link href="/admin" className={LINK_CLASSES}>
            {tNav('admin')}
          </Link>
        ) : null}
      </div>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">{t('skillsLabel')}</h2>
        {profile.skills.length === 0 ? (
          <p className="mt-2 text-ink-700">{t('noSkills')}</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {profile.skills.map((skill) => (
              <li key={skill.categoryPublicId}>
                <Badge>{skill.label}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* What other people said, above what this person did: on Koode the
          vouch is the asset, and it belongs high on the page. */}
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

      <section className="mt-8">
        <h2 className="text-xl font-semibold">{tInterest('myInterests')}</h2>
        {interests.length === 0 ? (
          <p className="mt-2 text-ink-700">{tInterest('myInterestsEmpty')}</p>
        ) : (
          <ol className="mt-3 flex flex-col gap-3">
            {interests.map((interest) => (
              <Card key={interest.interestPublicId} as="li">
                <Link
                  href={`/openings/${interest.requirementPublicId}`}
                  className="flex min-h-touch flex-col gap-2"
                >
                  <span className="font-medium">{interest.title}</span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-700">
                    {interest.localityLabel}
                    <Badge>{tInterest(interest.status)}</Badge>
                    <Badge>{tRequirements(`status.${interest.requirementStatus}`)}</Badge>
                  </span>
                </Link>
              </Card>
            ))}
          </ol>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">{tRequirements('myPostings')}</h2>
        {postings.length === 0 ? (
          <p className="mt-2 text-ink-700">{tRequirements('myPostingsEmpty')}</p>
        ) : (
          <ol className="mt-3 flex flex-col gap-3">
            {postings.map((posting) => (
              <Card key={posting.publicId} as="li">
                <Link
                  href={`/openings/${posting.publicId}`}
                  className="flex min-h-touch flex-col gap-2"
                >
                  <span className="font-medium">{posting.title}</span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-700">
                    {posting.localityLabel}
                    <Badge>{tRequirements(`status.${posting.status}`)}</Badge>
                    <span>
                      {tRequirements('postedOn', {
                        date: format.dateTime(new Date(posting.createdAt), 'short'),
                      })}
                    </span>
                  </span>
                </Link>
              </Card>
            ))}
          </ol>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">{t('dataTitle')}</h2>

        <Card className="mt-3">
          <p className="text-ink-700">{t('exportHint')}</p>
          {/*
           * A form rather than a link. The export is outside the [locale]
           * segment and answers with a file, not a page, so the locale-aware
           * Link is wrong for it — and every read is audited, which a link a
           * browser might prefetch would falsify.
           */}
          <form action="/api/me/export" className="mt-3">
            <Button type="submit" variant="secondary">
              {t('exportData')}
            </Button>
          </form>
        </Card>

        <div className="mt-4">
          <DangerZone />
        </div>
      </section>
    </div>
  );
}
