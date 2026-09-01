import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageGlow } from '@/components/ui/decor';
import { LogoMark } from '@/components/logo';
import { TownscapeArt, VouchNetworkArt } from '@/components/art';
import {
  IconArrowRight,
  IconBriefcase,
  IconMapPin,
  IconShield,
  IconSprout,
  IconStore,
  IconVouch,
  IconWrench,
} from '@/components/icons';
import { PayRange } from '@/components/requirements/pay-range';
import { getPlatformCounts } from '@/server/services/stats.service';
import { getCategoryGroups } from '@/server/services/category.service';
import { getFeaturedVouches } from '@/server/services/recommendation.service';
import { searchRequirements } from '@/server/services/requirement.service';

/**
 * The home page: a shop window with real stock in it.
 *
 * Every section below the hero is live data — the freshest vouches, the
 * newest openings, the actual taxonomy — because the honest version of
 * "social proof" for a platform whose product is on-the-record words is the
 * words themselves. Nothing here is marketing copy pretending to be content,
 * and a section with no rows yet simply does not render.
 *
 * Desktop gets a real layout, not a widened phone: the hero is two columns,
 * openings run three across, the tiers four. Mobile stacks the same sections
 * in the same order.
 */

type PageProps = { params: Promise<{ locale: string }> };

/** The four tiers keep their icons here, keyed by seed slug. */
const TIER_ICONS: Record<string, typeof IconSprout> = {
  'daily-manual': IconSprout,
  'skilled-trades': IconWrench,
  'commercial-operations': IconStore,
  'professional-office': IconBriefcase,
};

export default async function HomePage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, tAnchor, tEngagement, counts, tiers, vouches, latest] =
    await Promise.all([
      getTranslations('home'),
      getTranslations('anchor'),
      getTranslations('taxonomy.engagementType'),
      getPlatformCounts(),
      getCategoryGroups(locale),
      getFeaturedVouches(2, locale),
      searchRequirements({ includeNearby: false, limit: 6, locale }),
    ]);

  const steps = [
    { title: t('step1Title'), body: t('step1Body') },
    { title: t('step2Title'), body: t('step2Body') },
    { title: t('step3Title'), body: t('step3Body') },
  ];

  const stats = [
    { label: t('statOpenings'), value: counts.openRequirements },
    { label: t('statPeople'), value: counts.activePeople },
    { label: t('statRecommendations'), value: counts.recommendations },
  ];

  return (
    <div className="relative">
      <PageGlow />

      {/* ---- Hero: the claim on the left, the proof on the right ---------- */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-4 pt-10 lg:pt-14">
        <div className="grid items-start gap-10 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <h1 className="max-w-xl text-3xl font-semibold sm:text-4xl">
              {t('heroTitle')}
            </h1>
            <p className="mt-4 max-w-xl text-lg text-ink-700">{t('heroBody')}</p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/openings"
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-lg bg-brand-600 px-6 text-lg font-medium text-white hover:bg-brand-700"
              >
                {t('findWork')}
                <IconArrowRight className="size-5" />
              </Link>
              <Link
                href="/openings/new"
                className="inline-flex min-h-14 items-center justify-center rounded-lg border border-ink-300 bg-paper-raised px-6 text-lg font-medium hover:bg-ink-100"
              >
                {t('postWork')}
              </Link>
            </div>

            <dl className="mt-8 grid max-w-md grid-cols-3 gap-4 border-t border-ink-200 pt-5">
              {stats.map((stat) => (
                <div key={stat.label}>
                  <dd className="text-2xl font-semibold tabular-nums">{stat.value}</dd>
                  <dt className="mt-0.5 text-sm text-ink-700">{stat.label}</dt>
                </div>
              ))}
            </dl>
          </div>

          {/*
            The proof: the latest real vouches, verbatim. This panel IS the
            product — a competitor can screenshot the layout, not the graph.
            Renders nothing during cold start rather than showing samples.
          */}
          {vouches.length > 0 ? (
            <div className="flex flex-col gap-4 lg:pt-2">
              <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-ink-500">
                <IconVouch className="size-4.5 text-brand-600" />
                {t('vouchPanelTitle')}
              </p>

              {vouches.map((vouch) => (
                <Card key={vouch.subjectPublicId + vouch.createdAt} className="shadow-sm">
                  <blockquote className="line-clamp-3 border-s-4 border-brand-500 ps-3 text-base">
                    {vouch.note}
                  </blockquote>

                  <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-700">
                    <span className="font-medium text-ink-900">{vouch.referrerName}</span>
                    {vouch.referrerIsVerifiedMember ? (
                      <Badge tone="verified" glyph="✓">
                        {tAnchor('verified')}
                      </Badge>
                    ) : null}
                    <span aria-hidden="true">→</span>
                    <Link
                      href={`/people/${vouch.subjectPublicId}`}
                      className="underline underline-offset-2 hover:text-brand-700"
                    >
                      {vouch.subjectName}
                    </Link>
                    {vouch.categoryLabel ? (
                      <span className="text-ink-500">· {vouch.categoryLabel}</span>
                    ) : null}
                  </p>
                </Card>
              ))}
            </div>
          ) : (
            // Cold start: the vouch panel has nothing real to show, so the
            // idea gets drawn instead of faked with sample quotes.
            <div className="hidden lg:flex lg:items-center lg:justify-center">
              <VouchNetworkArt className="w-full max-w-xs text-brand-600" />
            </div>
          )}
        </div>
      </section>

      {/* ---- Latest openings: the stock in the window --------------------- */}
      {latest.items.length > 0 ? (
        <section className="mx-auto w-full max-w-6xl px-4 py-10">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold sm:text-2xl">{t('latestTitle')}</h2>
            <Link
              href="/openings"
              className="inline-flex min-h-touch items-center gap-1.5 font-medium text-brand-700 underline-offset-2 hover:underline"
            >
              {t('viewAll')}
              <IconArrowRight className="size-4.5" />
            </Link>
          </div>

          <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {latest.items.map((item) => (
              <Card
                key={item.publicId}
                as="li"
                className="h-full transition-colors hover:border-brand-600"
              >
                <Link href={`/openings/${item.publicId}`} className="flex h-full flex-col gap-2">
                  <h3 className="line-clamp-2 text-lg font-medium">{item.title}</h3>
                  <p className="flex items-center gap-1.5 text-sm text-ink-700">
                    <IconMapPin className="size-4 shrink-0 text-ink-500" />
                    {item.localityLabel}
                    <span aria-hidden="true"> · </span>
                    {item.categoryLabel}
                  </p>
                  <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
                    <Badge>{tEngagement(item.engagementType)}</Badge>
                    <PayRange
                      payMin={item.payMin}
                      payMax={item.payMax}
                      payPeriod={item.payPeriod}
                      className="text-sm font-medium"
                    />
                  </div>
                </Link>
              </Card>
            ))}
          </ol>
        </section>
      ) : null}

      {/* ---- The four tiers: every kind of work, same dignity -------------- */}
      <section className="border-y border-ink-200 bg-paper-raised">
        <div className="mx-auto w-full max-w-6xl px-4 py-10">
          <h2 className="text-xl font-semibold sm:text-2xl">{t('tiersTitle')}</h2>
          <p className="mt-1 max-w-2xl text-ink-700">{t('tiersBody')}</p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {tiers.map((tier) => {
              const TierIcon = TIER_ICONS[tier.slug] ?? IconBriefcase;
              return (
                <Link
                  key={tier.publicId}
                  href={`/openings?category=${tier.publicId}`}
                  className="group flex h-full flex-col gap-2 rounded-card border border-ink-200 p-4 transition-colors hover:border-brand-600"
                >
                  <span className="inline-flex size-10 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
                    <TierIcon className="size-5.5" />
                  </span>
                  <span className="font-medium group-hover:text-brand-700">{tier.label}</span>
                  {/* The first few real roles, straight from the taxonomy —
                      a bilingual description nobody has to maintain. */}
                  <span className="line-clamp-2 text-sm text-ink-500">
                    {tier.roles
                      .slice(0, 3)
                      .map((role) => role.label)
                      .join(' · ')}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---- How it works: three columns instead of a tower ---------------- */}
      <section className="mx-auto w-full max-w-6xl px-4 py-10">
        <h2 className="text-xl font-semibold sm:text-2xl">{t('howItWorksTitle')}</h2>
        <ol className="mt-4 grid gap-3 lg:grid-cols-3">
          {steps.map((step, index) => (
            <Card key={step.title} as="li" className="flex h-full gap-4">
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700"
              >
                {index + 1}
              </span>
              <div>
                <h3 className="font-medium">{step.title}</h3>
                <p className="mt-1 text-ink-700">{step.body}</p>
              </div>
            </Card>
          ))}
        </ol>
      </section>

      {/* ---- Trust: who stands behind this -------------------------------- */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-10">
        <Card className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl bg-verify-100 text-verify-600">
            <IconShield className="size-6" />
          </span>
          <div className="flex-1">
            <h2 className="text-lg font-semibold">{t('trustTitle')}</h2>
            <p className="mt-1 text-ink-700">{t('trustBody')}</p>
          </div>
        </Card>
      </section>

      {/* ---- Final call ----------------------------------------------------- */}
      <section className="relative overflow-hidden border-t border-ink-200 bg-brand-700">
        {/* The street, drawn into the band rather than sat above it. Low
            opacity so the heading keeps its contrast — the text sits on
            brand-700, and this never lightens that ground. */}
        <TownscapeArt className="pointer-events-none absolute inset-x-0 bottom-0 h-48 w-full text-white/20" />
        <div className="relative mx-auto flex w-full max-w-6xl flex-col items-start gap-5 px-4 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <LogoMark className="size-12" />
            <div>
              <h2 className="text-xl font-semibold text-white">{t('ctaTitle')}</h2>
              <p className="mt-1 text-brand-100">{t('ctaBody')}</p>
            </div>
          </div>
          <Link
            href="/sign-in"
            className="inline-flex min-h-14 shrink-0 items-center justify-center rounded-lg bg-white px-6 text-lg font-medium text-brand-700 hover:bg-brand-100"
          >
            {t('ctaAction')}
          </Link>
        </div>
      </section>
    </div>
  );
}
