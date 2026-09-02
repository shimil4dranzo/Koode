'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChipRadioGroup, Switch, type ChipOption } from '@/components/ui/choice';
import type { SearchScope } from '@/server/services/locality.service';

/**
 * The search filter, with a scope dial.
 *
 * "Where" is really two questions — how wide, then which place — so it is two
 * controls: scope chips (my area / block / district / state) and a place list
 * that follows the chosen scope. Every scope reuses the same subtree search on
 * the server; picking a district simply matches everything inside it.
 *
 * The nearby switch appears only at local scope. Adjacency is panchayat-level
 * data — "districts next to mine" is not a question anyone here is asking, and
 * pretending the toggle applies everywhere would make it a no-op lie at the
 * wider scopes.
 *
 * Still a plain GET form: the chips and selects are native inputs, so the
 * result is a URL somebody can send over WhatsApp, and the first search works
 * before this component's JavaScript has downloaded. The only thing hydration
 * adds is swapping the place list when the scope changes.
 */

type Props = {
  scopes: Array<{ value: SearchScope; label: string }>;
  localitiesByScope: Record<SearchScope, ChipOption[]>;
  categories: ChipOption[];
  engagements: ChipOption[];
  initial: {
    q: string;
    scope: SearchScope;
    locality: string;
    category: string;
    engagementType: string;
    nearby: boolean;
  };
  hasFilter: boolean;
};

export function OpeningsFilter({
  scopes,
  localitiesByScope,
  categories,
  engagements,
  initial,
  hasFilter,
}: Props) {
  const t = useTranslations('requirements');
  const tCommon = useTranslations('common');

  const [scope, setScope] = useState<SearchScope>(initial.scope);
  const [locality, setLocality] = useState(initial.locality);

  const places = localitiesByScope[scope] ?? [];

  return (
    <form method="get" aria-label={tCommon('filter')} className="mt-6">
      <Card>
        {/*
          Free text first, because it is the fastest way in and the way people
          arrive from the home page. It must live inside this form: a GET form
          submits only its own fields, so a `q` kept anywhere else would be
          silently dropped the moment somebody changed a filter chip.
        */}
        <div className="mb-5">
          <label htmlFor="opening-search" className="block text-base font-medium">
            {t('searchLabel')}
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="opening-search"
              type="search"
              name="q"
              defaultValue={initial.q}
              placeholder={t('searchPlaceholder')}
              className="min-h-touch w-full rounded-lg border border-ink-300 bg-paper-raised px-3 text-base"
            />
            <button
              type="submit"
              className="min-h-touch shrink-0 rounded-lg bg-brand-600 px-5 font-medium text-white hover:bg-brand-700"
            >
              {tCommon('search')}
            </button>
          </div>
        </div>

        <ChipRadioGroup
          legend={t('scope')}
          name="scope"
          value={scope}
          onChange={(next) => {
            setScope(next as SearchScope);
            // A panchayat id makes no sense once the scope says districts.
            setLocality('');
          }}
          options={scopes}
        />

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-base font-medium text-ink-900">
              {t('filterLocality')}
            </span>
            <select
              name="locality"
              value={locality}
              onChange={(event) => setLocality(event.target.value)}
              className="min-h-touch w-full appearance-none rounded-lg border border-ink-300 bg-paper-raised px-3 py-2.5 pe-8 text-base"
            >
              <option value="">{tCommon('all')}</option>
              {places.map((place) => (
                <option key={place.value} value={place.value}>
                  {place.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-base font-medium text-ink-900">
              {t('filterCategory')}
            </span>
            <select
              name="category"
              defaultValue={initial.category}
              className="min-h-touch w-full appearance-none rounded-lg border border-ink-300 bg-paper-raised px-3 py-2.5 pe-8 text-base"
            >
              <option value="">{tCommon('all')}</option>
              {categories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {scope === 'local' ? (
          <Switch
            className="mt-3"
            label={t('includeNearby')}
            name="nearby"
            defaultChecked={initial.nearby}
          />
        ) : null}

        <ChipRadioGroup
          className="mt-4"
          legend={t('filterEngagement')}
          name="engagementType"
          defaultValue={initial.engagementType}
          options={[{ value: '', label: tCommon('all') }, ...engagements]}
        />

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
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
  );
}
