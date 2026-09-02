import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RecommendationList } from '@/components/profile/recommendation-list';
import { DangerZone } from '@/components/profile/danger-zone';
import { GoogleUnlink } from '@/components/profile/google-link';
import { isGoogleSsoEnabled } from '@/server/auth/google';
import { prisma } from '@/server/db/client';
import { getCurrentPerson } from '@/server/auth/session';
import { canModerate } from '@/server/domain/person/rules';
import { getPublicProfile } from '@/server/services/person.service';
import { listOwnInterests } from '@/server/services/interest.service';
import { listMatchedRequirements, listOwnRequirements } from '@/server/services/requirement.service';
import { listAnchorOrgs, listOwnMemberships } from '@/server/services/anchor.service';
import { RequestVerification } from '@/components/profile/request-verification';
import { CopyLink } from '@/components/profile/copy-link';
import { PayRange } from '@/components/requirements/pay-range';
import { IconMapPin } from '@/components/icons';

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

  /**
   * The one place the person's own linked e-mail is read: their settings.
   * It never appears anywhere another user can see.
   */
  let googleSso: { enabled: boolean; linkedEmail: string | null } = {
    enabled: false,
    linkedEmail: null,
  };
  if (isGoogleSsoEnabled()) {
    const row = await prisma.person.findUniqueOrThrow({
      where: { id: person.id },
      select: { googleSub: true, email: true },
    });
    googleSso = { enabled: true, linkedEmail: row.googleSub ? (row.email ?? '') : null };
  }

  const isEmployer = person.accountType === 'employer';

  const [
    query,
    profile,
    interests,
    postings,
    matches,
    memberships,
    verifierOrgs,
    t,
    tCommon,
    tNav,
    tAnchor,
    tInterest,
    tRequirements,
    tDashboard,
    tEngagement,
    format,
  ] = await Promise.all([
    searchParams,
    getPublicProfile(person.publicId, person, locale),
    listOwnInterests(person, locale),
    listOwnRequirements(person, locale),
    // Matches are a seeker's thing; an employer's dashboard leads with their
    // postings and does not need the query.
    isEmployer ? Promise.resolve([]) : listMatchedRequirements(person, locale),
    listOwnMemberships(person, locale),
    listAnchorOrgs(locale),
    getTranslations('profile'),
    getTranslations('common'),
    getTranslations('nav'),
    getTranslations('anchor'),
    getTranslations('interest'),
    getTranslations('requirements'),
    getTranslations('dashboard'),
    getTranslations('taxonomy.engagementType'),
    getFormatter(),
  ]);

  // What an employer reads before calling, and what is still blank.
  const missing = [
    ...(profile.headline ? [] : [tDashboard('itemHeadline')]),
    ...(profile.education ? [] : [tDashboard('itemEducation')]),
    ...(profile.skills.length > 0 ? [] : [tDashboard('itemSkills')]),
    ...(profile.localityLabel ? [] : [tDashboard('itemLocality')]),
  ];
  // Orgs still worth asking: not already requested or granted.
  const askable = verifierOrgs.filter(
    (org) => !memberships.some((m) => m.anchorOrgPublicId === org.publicId && m.status !== 'revoked'),
  );

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

      {/* ---- The dashboard proper: what this person came here to do -------

          Two audiences, one page. An employer's page leads with their postings
          and who is waiting on them; a seeker's leads with what still needs
          filling in, then the openings that fit, then where their applications
          stand. Everything below the fold — skills, recommendations, sign-in
          methods, data — is the same for both.
      */}
      <h2 className="mt-10 text-xl font-semibold sm:text-2xl">
        {isEmployer ? tDashboard('employerTitle') : tDashboard('seekerTitle')}
      </h2>

      {isEmployer ? (
        <section className="mt-4">
          <h3 className="text-lg font-semibold">{tDashboard('postingsTitle')}</h3>
          {postings.length === 0 ? (
            <Card className="mt-3">
              <p className="text-ink-700">{tDashboard('postingsEmpty')}</p>
              <Link
                href="/openings/new"
                className="mt-3 inline-flex min-h-touch items-center rounded-lg bg-brand-600 px-5 font-medium text-white hover:bg-brand-700"
              >
                {tNav('postWork')}
              </Link>
            </Card>
          ) : (
            <ol className="mt-3 flex flex-col gap-3">
              {postings.map((posting) => (
                <Card key={posting.publicId} as="li" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <Link href={`/openings/${posting.publicId}`} className="font-medium underline-offset-2 hover:underline">
                      {posting.title}
                    </Link>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-700">
                      {posting.localityLabel}
                      <Badge>{tRequirements(`status.${posting.status}`)}</Badge>
                      <span>
                        {tRequirements('postedOn', {
                          date: format.dateTime(new Date(posting.createdAt), 'short'),
                        })}
                      </span>
                    </p>
                  </div>
                  {/* The number that matters: who is waiting. Links straight
                      to the candidates, where shortlisting and contact live. */}
                  <Link
                    href={`/openings/${posting.publicId}/interest`}
                    className="inline-flex min-h-touch shrink-0 items-center gap-2 rounded-lg border border-brand-600 px-4 font-medium text-brand-700 hover:bg-brand-100/50"
                  >
                    {tDashboard('candidates', { count: posting.interestCount })}
                  </Link>
                </Card>
              ))}
            </ol>
          )}
        </section>
      ) : (
        <>
          {/* Profile completeness: the four things an employer reads. */}
          <Card className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">{tDashboard('profileStrength')}</h3>
              {missing.length === 0 ? (
                <Badge tone="open" glyph="✓">
                  {tDashboard('complete')}
                </Badge>
              ) : null}
            </div>
            {missing.length > 0 ? (
              <>
                <p className="mt-1 text-ink-700">{tDashboard('missing', { items: missing.join(', ') })}</p>
                <Link
                  href="/profile/onboarding"
                  className="mt-3 inline-flex min-h-touch items-center rounded-lg bg-brand-600 px-5 font-medium text-white hover:bg-brand-700"
                >
                  {tDashboard('editProfile')}
                </Link>
              </>
            ) : null}
          </Card>

          {/* Verification: institution or community body confirms the profile. */}
          <Card className="mt-4">
            <h3 className="text-lg font-semibold">{tDashboard('verificationTitle')}</h3>
            {memberships.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-1 text-ink-700">
                {memberships
                  .filter((m) => m.status !== 'revoked')
                  .map((m) => (
                    <li key={m.anchorOrgPublicId} className="flex flex-wrap items-center gap-2">
                      {m.status === 'verified' ? (
                        <>
                          <Badge tone="verified" glyph="✓">{tAnchor('verified')}</Badge>
                          {tDashboard('verificationVerified', { org: m.orgName })}
                        </>
                      ) : (
                        <>
                          <Badge tone="warn" glyph="…">{tAnchor('pending')}</Badge>
                          {tDashboard('verificationPending', { org: m.orgName })}
                        </>
                      )}
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="mt-1 text-ink-700">{tDashboard('verificationBody')}</p>
            )}
            {askable.length > 0 ? (
              <div className="mt-4">
                <RequestVerification orgs={askable} />
              </div>
            ) : null}
          </Card>

          {/* Openings for you: matched on skills, nearest first. */}
          <section className="mt-6">
            <h3 className="text-lg font-semibold">{tDashboard('matchesTitle')}</h3>
            <p className="mt-1 text-sm text-ink-700">{tDashboard('matchesBody')}</p>
            {matches.length === 0 ? (
              <p className="mt-2 text-ink-700">
                {tDashboard('matchesEmpty')}{' '}
                <Link href="/openings" className="underline underline-offset-2">
                  {tNav('openings')}
                </Link>
              </p>
            ) : (
              <ol className="mt-3 grid gap-3 sm:grid-cols-2">
                {matches.map((opening) => (
                  <Card key={opening.publicId} as="li">
                    <Link href={`/openings/${opening.publicId}`} className="font-medium underline-offset-2 hover:underline">
                      {opening.title}
                    </Link>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-ink-700">
                      <span className="inline-flex items-center gap-1">
                        <IconMapPin className="size-4 text-ink-500" />
                        {opening.localityLabel}
                      </span>
                      <span aria-hidden="true">·</span>
                      {tEngagement(opening.engagementType)}
                    </p>
                    <div className="mt-2 text-sm">
                      <PayRange payMin={opening.payMin} payMax={opening.payMax} payPeriod={opening.payPeriod} />
                    </div>
                  </Card>
                ))}
              </ol>
            )}
          </section>

          {/* Getting vouched for: share the profile link. */}
          <Card className="mt-6">
            <h3 className="text-lg font-semibold">{tDashboard('vouchTitle')}</h3>
            <p className="mt-1 text-ink-700">{tDashboard('vouchBody')}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <CopyLink path={`/${locale}/people/${profile.publicId}`} />
              <Link href={`/people/${profile.publicId}`} className={LINK_CLASSES}>
                {tDashboard('viewProfile')}
              </Link>
            </div>
          </Card>
        </>
      )}

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

      {isEmployer ? null : (
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
      )}

      {googleSso.enabled ? (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">{t('signInMethods')}</h2>
          <Card className="mt-3">
            {googleSso.linkedEmail ? (
              <div className="flex flex-col gap-3">
                <p>{t('googleLinkedAs', { email: googleSso.linkedEmail })}</p>
                <div>
                  <GoogleUnlink />
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-ink-700">{t('linkGoogleHint')}</p>
                {/* A plain anchor: the OAuth start route answers with a
                    redirect to Google, which next/link must not intercept. */}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a
                  href="/api/auth/google/start?mode=link"
                  className="inline-flex min-h-touch w-fit items-center rounded-lg border border-ink-300 bg-paper-raised px-4 py-2.5 font-medium hover:bg-ink-100"
                >
                  {t('linkGoogle')}
                </a>
              </div>
            )}
          </Card>
        </section>
      ) : null}

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
