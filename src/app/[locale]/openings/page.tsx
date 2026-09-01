import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, EmptyState } from '@/components/ui/card';
import { SelectField } from '@/components/ui/field';
import { PayRange } from '@/components/requirements/pay-range';
import { getCategoryOptions } from '@/server/services/category.service';
import { getLocalityOptions } from '@/server/services/locality.service';
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

  const [query, t, tCommon, tAnchor, tEngagement, localities, categories] = await Promise.all([
    searchParams,
    getTranslations('requirements'),
    getTranslations('common'),
    getTranslations('anchor'),
    getTranslations('taxonomy.engagementType'),
    getLocalityOptions(locale),
    getCategoryOptions(locale),
  ]);

  /**
   * A public id that is not in the picker is dropped rather than passed on.
   * `searchRequirements` resolves ids through the database and throws a 404 for
   * one it does not know, so a stale bookmark or a hand-edited URL would
   * otherwise blow up the whole page instead of just ignoring one filter.
   */
  const requestedLocality = firstValue(query.locality);
  const requestedCategory = firstValue(query.category);
  const requestedEngagement = firstValue(query.engagementType);

  const localityPublicId = localities.some((option) => option.publicId === requestedLocality)
    ? requestedLocality
    : undefined;
  const categoryPublicId = categories.some((option) => option.value === requestedCategory)
    ? requestedCategory
    : undefined;
  const engagementType = isOneOf(ENGAGEMENT_TYPES, requestedEngagement)
    ? requestedEngagement
    : undefined;
  const includeNearby = firstValue(query.nearby) === 'true';

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
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold sm:text-3xl">{t('listTitle')}</h1>

      <form method="get" aria-label={tCommon('filter')} className="mt-6">
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label={t('filterLocality')}
              name="locality"
              placeholder={tCommon('all')}
              defaultValue={localityPublicId ?? ''}
              options={localities.map((option) => ({
                value: option.publicId,
                label: option.label,
              }))}
            />

            <SelectField
              label={t('filterCategory')}
              name="category"
              placeholder={tCommon('all')}
              defaultValue={categoryPublicId ?? ''}
              options={categories}
            />

            <SelectField
              label={t('filterEngagement')}
              name="engagementType"
              placeholder={tCommon('all')}
              defaultValue={engagementType ?? ''}
              options={ENGAGEMENT_TYPES.map((value) => ({
                value,
                label: tEngagement(value),
              }))}
            />

            <label className="flex min-h-touch items-center gap-3 self-end">
              <input
                type="checkbox"
                name="nearby"
                value="true"
                defaultChecked={includeNearby}
                className="size-5 shrink-0 rounded border border-ink-300"
              />
              <span>{t('includeNearby')}</span>
            </label>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button type="submit" size="lg">
              {tCommon('search')}
            </Button>
            {hasFilter ? (
              <Link
                href="/openings"
                className="inline-flex min-h-touch items-center justify-center rounded-lg px-4 py-2.5 underline underline-offset-2 hover:bg-ink-100"
              >
                {tCommon('clear')}
              </Link>
            ) : null}
          </div>
        </Card>
      </form>

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
