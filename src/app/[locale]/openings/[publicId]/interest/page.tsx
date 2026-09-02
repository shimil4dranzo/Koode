import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, EmptyState } from '@/components/ui/card';
import { RecommendationList } from '@/components/profile/recommendation-list';
import { CandidateActions } from '@/components/interest/candidate-actions';
import { RevealCandidateContact } from '@/components/interest/reveal-candidate-contact';
import { getCurrentPerson, type CurrentPerson } from '@/server/auth/session';
import { isAppError } from '@/server/errors';
import {
  listInterestedCandidates,
  type InterestedCandidate,
} from '@/server/services/interest.service';
import { getRequirementDetail } from '@/server/services/requirement.service';

/**
 * Who raised their hand, and what people say about them.
 *
 * This is the screen the whole product is built towards: a named vouch,
 * written by somebody local, in front of the person deciding whether to make
 * the call. The recommendations are therefore inline on each candidate — not
 * behind a "view profile" tap, which is where they would go unread.
 *
 * Still no phone numbers. Reaching a candidate goes through the same audited
 * reveal as everywhere else.
 */

type PageProps = { params: Promise<{ locale: string; publicId: string }> };

/**
 * Which posting this is. Cached so `generateMetadata` and the page body make
 * one query between them rather than two.
 */
const loadTitle = cache(async (publicId: string, locale: string): Promise<string> => {
  const detail = await getRequirementDetail(publicId, await getCurrentPerson(), locale);
  return detail.title;
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, publicId } = await params;
  const [t, title] = await Promise.all([
    getTranslations({ locale, namespace: 'interest' }),
    loadTitle(publicId, locale).catch(() => null),
  ]);

  return { title: title ? `${t('title')} · ${title}` : t('title') };
}

export default async function InterestPage({ params }: PageProps) {
  const { locale, publicId } = await params;
  setRequestLocale(locale);

  const person = await getCurrentPerson();
  // next-intl's `redirect` throws, but its signature does not return `never`,
  // so the narrowing has to be made explicit for anything below it.
  if (!person) {
    redirect({ href: '/sign-in', locale });
    return null;
  }

  const [{ candidates, title }, t, tCommon, tAnchor, tProfile, tOutcome, format] =
    await Promise.all([
      loadOrNotFound(publicId, person, locale),
      getTranslations('interest'),
      getTranslations('common'),
      getTranslations('anchor'),
      getTranslations('profile'),
      getTranslations('engagement.outcome'),
      getFormatter(),
    ]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold sm:text-3xl">{t('title')}</h1>

      {/* Which posting: an employer with three open at once needs telling. */}
      <p className="mt-2 text-lg text-ink-700">{title}</p>
      <p className="mt-1 text-ink-700">{t('candidateCount', { count: candidates.length })}</p>

      {candidates.length === 0 ? (
        <div className="mt-6">
          <EmptyState title={t('empty')} />
        </div>
      ) : (
        <ol className="mt-6 flex flex-col gap-4">
          {candidates.map((candidate) => (
            <Card key={candidate.interestPublicId} as="li">
              <h2 className="flex flex-wrap items-center gap-x-3 gap-y-2 text-lg font-medium">
                <Link
                  href={`/people/${candidate.person.publicId}`}
                  className="underline underline-offset-2"
                >
                  {candidate.person.displayName}
                </Link>
                {candidate.person.isVerifiedMember ? (
                  <Badge tone="verified" glyph="✓">
                    {tAnchor('verified')}
                  </Badge>
                ) : null}
                <Badge>{t(candidate.status)}</Badge>
                {candidate.person.skillsMatch ? (
                  <Badge tone="open" glyph="◆">
                    {t('skillsMatch')}
                  </Badge>
                ) : null}
                {candidate.engagementOutcome ? (
                  <Badge tone="open">{tOutcome(candidate.engagementOutcome)}</Badge>
                ) : null}
              </h2>

              {candidate.person.localityLabel ? (
                <p className="mt-1 text-ink-700">{candidate.person.localityLabel}</p>
              ) : null}

              {candidate.person.headline ? (
                <p className="mt-1 text-ink-900">{candidate.person.headline}</p>
              ) : null}

              {candidate.person.skills.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {candidate.person.skills.map((skill) => (
                    <li key={skill}>
                      <Badge>{skill}</Badge>
                    </li>
                  ))}
                </ul>
              ) : null}

              {candidate.note ? (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-ink-700">{t('noteLabel')}</h3>
                  <p className="mt-1 whitespace-pre-line">{candidate.note}</p>
                </div>
              ) : null}

              {/* The reason this screen exists, inline and unfolded. */}
              <div className="mt-4">
                <h3 className="text-base font-medium">{tProfile('recommendationsTitle')}</h3>
                {candidate.recommendations.length === 0 ? (
                  <p className="mt-1 text-ink-700">{tProfile('noRecommendations')}</p>
                ) : (
                  <div className="mt-2">
                    <RecommendationList recommendations={candidate.recommendations} />
                  </div>
                )}
              </div>

              <p className="mt-4 text-sm text-ink-500">
                {t('expressedOn', {
                  date: format.dateTime(new Date(candidate.createdAt), 'short'),
                })}
              </p>

              <CandidateActions
                requirementPublicId={publicId}
                interestPublicId={candidate.interestPublicId}
                personPublicId={candidate.person.publicId}
                status={candidate.status}
                outcome={candidate.engagementOutcome}
              />

              {/* Direct contact: appears once the employer has shortlisted. */}
              <div className="mt-4">
                <RevealCandidateContact
                  interestPublicId={candidate.interestPublicId}
                  status={candidate.status}
                />
              </div>
            </Card>
          ))}
        </ol>
      )}

      <p className="mt-8">
        <Link href={`/openings/${publicId}`} className="underline underline-offset-2">
          {tCommon('back')}
        </Link>
      </p>
    </div>
  );
}

/**
 * A posting that does not exist and one belonging to somebody else are both
 * rendered as a 404. Distinguishing them would tell a stranger that a given
 * posting id is real and whose it is not.
 */
async function loadOrNotFound(
  publicId: string,
  employer: CurrentPerson,
  locale: string,
): Promise<{ candidates: InterestedCandidate[]; title: string }> {
  try {
    // Both loads inside one guard: whichever rejects first, the answer the
    // visitor gets is the same 404.
    const [candidates, title] = await Promise.all([
      listInterestedCandidates(publicId, employer, locale),
      loadTitle(publicId, locale),
    ]);
    return { candidates, title };
  } catch (error) {
    if (isAppError(error) && (error.code === 'NOT_FOUND' || error.code === 'FORBIDDEN')) {
      notFound();
    }
    throw error;
  }
}
