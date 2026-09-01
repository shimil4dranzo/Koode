import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, EmptyState } from '@/components/ui/card';
import { PageGlow } from '@/components/ui/decor';
import { PayRange } from '@/components/requirements/pay-range';
import { OpeningsFilter } from '@/components/requirements/openings-filter';
import { getCategoryOptions } from '@/server/services/category.service';
import {
  SEARCH_SCOPES,
  getLocalityOptionsByScope,
  type SearchScope,
} from '@/server/services/locality.service';
import { searchRequirements } from '@/server/services/requirement.service';
import { ENGAGEMENT_TYPES, isOneOf } from '@/server/domain/constants';

/**
 * Finding work.
 *
 * The filter is a plain GET form: the whole page, including the search, works
 * with JavaScript switched off or still downloading, and the resulting URL is
 * a link somebody can send over WhatsApp. Structured filters rather than a
 * search box is a deliberate product decision — see the note on
 * `searchRequirements`.
 *
 * The search runs in this Server Component against the database directly. Going
 * out through /api/requirements would mean the server making an HTTP call to
 * itself for data it can already reach.
 */

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'requirements' });
  return { title: t('listTitle') };
}

/** A repeated query parameter is a malformed URL, not a multi-select. */
function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function OpeningsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [query, t, tCommon, tAnchor, tEngagement, tLevel, localitiesByScope, categories] =
    await Promise.all([
      searchParams,
      getTranslations('requirements'),
      getTranslations('common'),
      getTranslations('anchor'),
      getTranslations('taxonomy.engagementType'),
      getTranslations('taxonomy.localityLevel'),
      getLocalityOptionsByScope(locale),
      getCategoryOptions(locale),
    ]);

  /**
   * A public id that is not in a picker is dropped rather than passed on.
   * `searchRequirements` resolves ids through the database and throws a 404 for
   * one it does not know, so a stale bookmark or a hand-edited URL would
   * otherwise blow up the whole page instead of just ignoring one filter.
   */
  const requestedLocality = firstValue(query.locality);
  const requestedCategory = firstValue(query.category);
  const requestedEngagement = firstValue(query.engagementType);
  const requestedScope = firstValue(query.scope);

  // The scope a locality belongs to is recovered from which list holds it, so
  // reloading a shared URL restores the dial to where its author left it.
  const scopeOfSelected = SEARCH_SCOPES.find((scope) =>
    localitiesByScope[scope].some((option) => option.publicId === requestedLocality),
  );

  const localityPublicId = scopeOfSelected !== undefined ? requestedLocality : undefined;
  const scope: SearchScope =
    scopeOfSelected ??
    (isOneOf(SEARCH_SCOPES, requestedScope) ? requestedScope : 'local');

  const categoryPublicId = categories.some((option) => option.value === requestedCategory)
    ? requestedCategory
    : undefined;
  const engagementType = isOneOf(ENGAGEMENT_TYPES, requestedEngagement)
    ? requestedEngagement
    : undefined;
  const includeNearby = scope === 'local' && firstValue(query.nearby) === 'true';

  const hasFilter =
    localityPublicId !== undefined ||
    categoryPublicId !== undefined ||
    engagementType !== undefined ||
    includeNearby;

  const { items } = await searchRequirements({
    localityPublicId,
    categoryPublicId,
    engagementType,
    includeNearby,
    limit: 20,
    locale,
  });

  return (
    <div className="relative mx-auto w-full max-w-3xl px-4 py-8">
      <PageGlow />
      <h1 className="text-2xl font-semibold sm:text-3xl">{t('listTitle')}</h1>

      <OpeningsFilter
        scopes={[
          { value: 'local', label: t('scopeLocal') },
          { value: 'block', label: tLevel('block') },
          { value: 'district', label: tLevel('district') },
          { value: 'state', label: tLevel('state') },
        ]}
        localitiesByScope={
          Object.fromEntries(
            SEARCH_SCOPES.map((key) => [
              key,
              localitiesByScope[key].map((option) => ({
                value: option.publicId,
                label: option.label,
              })),
            ]),
          ) as Record<SearchScope, { value: string; label: string }[]>
        }
        categories={categories}
        engagements={ENGAGEMENT_TYPES.map((value) => ({
          value,
          label: tEngagement(value),
        }))}
        initial={{
          scope,
          locality: localityPublicId ?? '',
          category: categoryPublicId ?? '',
          engagementType: engagementType ?? '',
          nearby: includeNearby,
        }}
        hasFilter={hasFilter}
      />

      <p className="mt-6 text-ink-700">{t('resultCount', { count: items.length })}</p>

      {items.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            title={t('empty')}
            hint={t('emptyHint')}
            action={
              hasFilter ? (
                <Link
                  href="/openings"
                  className="inline-flex min-h-touch items-center justify-center rounded-lg border border-ink-300 bg-paper-raised px-4 py-2.5 font-medium hover:bg-ink-100"
                >
                  {tCommon('clear')}
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : (
        <ol className="mt-3 flex flex-col gap-3">
          {items.map((item) => (
            <Card
              key={item.publicId}
              as="li"
              className="transition-colors hover:border-brand-600"
            >
              <Link
                href={`/openings/${item.publicId}`}
                className="flex min-h-touch flex-col gap-2"
              >
                <h2 className="text-lg font-medium">{item.title}</h2>

                <p className="text-ink-700">
                  {item.categoryLabel}
                  <span aria-hidden="true"> · </span>
                  {item.localityLabel}
                </p>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  {/* Neutral, not brand: leaving colour unspent here is what
                      lets the verified badge below carry weight. */}
                  <Badge>{tEngagement(item.engagementType)}</Badge>
                  <PayRange
                    payMin={item.payMin}
                    payMax={item.payMax}
                    payPeriod={item.payPeriod}
                    className="font-medium"
                  />
                  <span className="text-ink-700">
                    {t('vacancyCount', { count: item.vacancies })}
                  </span>
                </div>

                <p className="flex flex-wrap items-center gap-2 text-sm text-ink-700">
                  {t('postedBy', { name: item.postedByName })}
                  {item.postedByIsVerifiedMember ? (
                    <Badge tone="verified" glyph="✓">
                      {tAnchor('verified')}
                    </Badge>
                  ) : null}
                </p>
              </Link>
            </Card>
          ))}
        </ol>
      )}
    </div>
  );
}
