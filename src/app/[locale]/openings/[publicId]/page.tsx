import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PayRange } from '@/components/requirements/pay-range';
import { ExpressInterest } from '@/components/requirements/express-interest';
import { RevealContact } from '@/components/requirements/reveal-contact';
import { getCurrentPerson, getRequestMeta, requirePerson } from '@/server/auth/session';
import { isAppError } from '@/server/errors';
import {
  getRequirementDetail,
  transitionRequirement,
  type RequirementDetail,
} from '@/server/services/requirement.service';

/**
 * One posting.
 *
 * Everything here is server-rendered except the two buttons that have to talk
 * back: revealing a number and expressing interest. In particular the
 * employer's number is not in the HTML — the page has no way to leak it,
 * because it never receives it.
 */

type PageProps = { params: Promise<{ locale: string; publicId: string }> };

/**
 * `generateMetadata` and the page body both need the posting. React's `cache`
 * makes that one query per request rather than two.
 */
const loadDetail = cache(
  async (publicId: string, locale: string): Promise<RequirementDetail> =>
    getRequirementDetail(publicId, await getCurrentPerson(), locale),
);

/**
 * A posting that does not exist, or that a moderator has hidden, must render as
 * a 404 page rather than an error page — the service already refuses to
 * distinguish the two, and so should the UI.
 */
async function loadOrNotFound(publicId: string, locale: string): Promise<RequirementDetail> {
  try {
    return await loadDetail(publicId, locale);
  } catch (error) {
    if (isAppError(error) && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
}

/**
 * Closing is a Server Action rather than a fourth Client Component: it is one
 * button with no in-page state, and a plain form keeps the owner's controls
 * working on a phone that has not finished downloading JavaScript.
 */
async function closeRequirement(formData: FormData): Promise<void> {
  'use server';

  const publicId = formData.get('publicId');
  if (typeof publicId !== 'string') return;

  const person = await requirePerson();
  await transitionRequirement(publicId, 'closed', person, await getRequestMeta());
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, publicId } = await params;
  const detail = await loadOrNotFound(publicId, locale);
  return { title: detail.title };
}

export default async function RequirementPage({ params }: PageProps) {
  const { locale, publicId } = await params;
  setRequestLocale(locale);

  const [detail, t, tCommon, tAnchor, tInterest, tEngagement, format] = await Promise.all([
    loadOrNotFound(publicId, locale),
    getTranslations('requirements'),
    getTranslations('common'),
    getTranslations('anchor'),
    getTranslations('interest'),
    getTranslations('taxonomy.engagementType'),
    getFormatter(),
  ]);

  const isOpen = detail.status === 'open';

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold sm:text-3xl">{detail.title}</h1>

      <p className="mt-2 text-lg text-ink-700">
        {detail.categoryLabel}
        <span aria-hidden="true"> · </span>
        {detail.localityLabel}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Badge>{tEngagement(detail.engagementType)}</Badge>
        <span className="text-ink-700">
          {t('vacancyCount', { count: detail.vacancies })}
        </span>
      </div>

      <PayRange
        payMin={detail.payMin}
        payMax={detail.payMax}
        payPeriod={detail.payPeriod}
        className="mt-3 block text-xl font-semibold"
      />

      {isOpen ? null : (
        <p
          role="status"
          className="mt-4 rounded-lg border border-warn-600 bg-warn-100 px-4 py-3 text-warn-600"
        >
          {t(detail.status)}
        </p>
      )}

      {detail.description ? (
        <section className="mt-6">
          <h2 className="text-lg font-medium">{t('fieldDescription')}</h2>
          {/* The employer typed line breaks on purpose — timings, one per line. */}
          <p className="mt-2 whitespace-pre-line text-ink-900">{detail.description}</p>
        </section>
      ) : null}

      <p className="mt-6 flex flex-wrap items-center gap-2 text-ink-700">
        {t('postedBy', { name: detail.postedByName })}
        {detail.postedByIsVerifiedMember ? (
          <Badge tone="verified" glyph="✓">
            {tAnchor('verified')}
          </Badge>
        ) : null}
      </p>

      <p className="mt-1 text-sm text-ink-700">
        {t('postedOn', { date: format.dateTime(new Date(detail.createdAt), 'short') })}
        <span aria-hidden="true"> · </span>
        {t('expiresOn', { date: format.dateTime(new Date(detail.expiresAt), 'short') })}
      </p>

      <div className="mt-8 flex flex-col gap-3">
        {detail.isOwner ? (
          <>
            {/* The owner's next step is reading who raised their hand, so this
                is the screen's one primary control. */}
            <Link
              href={`/openings/${detail.publicId}/interest`}
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-lg bg-brand-600 px-6 text-lg font-medium text-white hover:bg-brand-700"
            >
              {tInterest('title')}
              <span className="tabular-nums">{detail.interestCount}</span>
            </Link>

            {isOpen ? (
              // Destructive, so it lives below a rule at ordinary size — never
              // the same weight, width and position as the primary action,
              // where a thumb aiming for one lands on the other.
              <form
                action={closeRequirement}
                className="mt-3 border-t border-ink-200 pt-4"
              >
                <input type="hidden" name="publicId" value={detail.publicId} />
                <Button type="submit" variant="danger">
                  {t('close')}
                </Button>
              </form>
            ) : null}
          </>
        ) : null}

        {/*
         * Only a stranger is offered these. The owner revealing their own number
         * would write a meaningless line into the audit log, and neither action
         * is accepted by the server once a posting has stopped being open.
         */}
        {!detail.isOwner && isOpen ? (
          <>
            <RevealContact
              requirementPublicId={detail.publicId}
              contactPreference={detail.contactPreference}
            />
            <ExpressInterest
              requirementPublicId={detail.publicId}
              alreadyInterested={detail.viewerHasExpressedInterest}
            />
          </>
        ) : null}
      </div>

      <p className="mt-8">
        <Link href="/openings" className="underline underline-offset-2">
          {tCommon('back')}
        </Link>
      </p>
    </article>
  );
}
