import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageGlow } from '@/components/ui/decor';
import { LogoMark } from '@/components/logo';
import { TownscapeArt } from '@/components/art';
import { ScrollReveal } from '@/components/scroll-reveal';
import { VouchGraph3d } from '@/components/three/vouch-graph-3d';
import type { StyleWithVars } from '@/lib/css';
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
  'remote-digital': IconMapPin,
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
      {/* Turns the reveals on. Until it runs, CSS leaves everything visible,
          so no-JS and old browsers get the finished page, not a blank one. */}
      <ScrollReveal />
      <PageGlow />

      {/* ---- Hero: the launch banner ------------------------------------

        Full-bleed and dark, and the only dark band in the app. Two reasons,
        both practical rather than fashionable: the WebGL graph behind the
        headline is drawn with additive blending, which glows on near-black
        and disappears on white; and a single dark band gives the launch a
        moment of stagecraft without committing the pages people actually
        work in — read outdoors, on cheap screens — to a dark theme.

        The graph is not decoration. Every point is a person on the platform
        and every line is a real recommendation, counted from the database, so
        the banner is a portrait of the thing the product accumulates. On a
        device that cannot afford WebGL the same idea arrives as a self-drawing
        SVG, and the text above it is unchanged either way.
      */}
      <section className="relative isolate overflow-hidden bg-night-900 text-white">
        {/* The backdrop. aria-hidden inside; it carries no information that
            is not also written in the copy. */}
        <div className="pointer-events-none absolute inset-0">
          <VouchGraph3d
            variant="hero"
            peopleCount={counts.activePeople}
            vouchCount={counts.recommendations}
            className="size-full"
            fallbackClassName="absolute inset-0 m-auto h-auto w-full max-w-3xl opacity-40 text-brand-500"
          />
        </div>

        {/*
          Scrims, not opacity on the canvas: the graph stays bright where
          there is no text and is pushed down where there is. Without this the
          headline sits on a moving field and the contrast changes frame to
          frame, which is how animated heroes end up unreadable.
        */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-night-900 via-night-900/70 to-night-900/20 lg:via-night-900/55 lg:to-transparent"
        />
        {/* Hands off to the light page below instead of stopping at an edge. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-paper"
        />

        <div className="relative mx-auto w-full max-w-6xl px-4 pb-12 pt-10 lg:pb-28 lg:pt-20">
          <div className="grid items-start gap-10 lg:grid-cols-[1.05fr_1fr]">
            <div data-reveal="lift">
              <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-night-300">
                <LogoMark className="size-5" />
                {t('heroEyebrow')}
              </p>

              <h1 className="mt-5 max-w-xl text-4xl font-semibold sm:text-5xl">
                {t('heroTitle')}
              </h1>
              <p className="mt-5 max-w-xl text-lg text-night-300">{t('heroBody')}</p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/openings"
                  className="inline-flex min-h-14 items-center justify-center gap-2 rounded-lg bg-brand-500 px-6 text-lg font-medium text-night-900 hover:bg-brand-100"
                >
                  {t('findWork')}
                  <IconArrowRight className="size-5" />
                </Link>
                <Link
                  href="/openings/new"
                  className="inline-flex min-h-14 items-center justify-center rounded-lg border border-white/30 px-6 text-lg font-medium text-white hover:bg-white/10"
                >
                  {t('postWork')}
                </Link>
              </div>

              <dl className="mt-8 grid max-w-md grid-cols-3 gap-4 border-t border-white/20 pt-5 lg:mt-10">
                {stats.map((stat) => (
                  <div key={stat.label}>
                    <dd className="text-3xl font-semibold tabular-nums">{stat.value}</dd>
                    <dt className="mt-0.5 text-sm text-night-300">{stat.label}</dt>
                  </div>
                ))}
              </dl>

              <p className="mt-6 max-w-sm text-sm text-night-300 lg:mt-8">
                {t('heroGraphCaption')}
              </p>
            </div>

            {/*
              The proof: the latest real vouches, verbatim. This panel IS the
              product — a competitor can screenshot the layout, not the graph.
              Renders nothing during cold start rather than showing samples.
            */}
            {vouches.length > 0 ? (
              <div className="flex flex-col gap-4 lg:pt-10" data-reveal="swing">
                <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-night-300">
                  <IconVouch className="size-4.5 text-brand-500" />
                  {t('vouchPanelTitle')}
                </p>

                {vouches.map((vouch) => (
                  <div
                    key={vouch.subjectPublicId + vouch.createdAt}
                    // Translucent rather than a solid card: the graph stays
                    // faintly visible through the panel, which is what makes
                    // the quotes read as sitting inside the network.
                    className="rounded-card border border-white/20 bg-night-800/70 p-4 backdrop-blur-sm sm:p-5"
                  >
                    <blockquote className="line-clamp-3 border-s-4 border-brand-500 ps-3 text-base text-white">
                      {vouch.note}
                    </blockquote>

                    <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-night-300">
                      <span className="font-medium text-white">{vouch.referrerName}</span>
                      {vouch.referrerIsVerifiedMember ? (
                        <Badge tone="verified" glyph="✓">
                          {tAnchor('verified')}
                        </Badge>
                      ) : null}
                      <span aria-hidden="true">→</span>
                      <Link
                        href={`/people/${vouch.subjectPublicId}`}
                        className="text-white underline underline-offset-2 hover:text-brand-100"
                      >
                        {vouch.subjectName}
                      </Link>
                      {vouch.categoryLabel ? (
                        <span>· {vouch.categoryLabel}</span>
                      ) : null}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/*
        The premise, in one line.

        This is the argument the About page makes at length, compressed to the
        single claim a visitor needs before the listings mean anything: both
        sides are already searching and cannot see each other. Placed above the
        openings because a list of jobs reads differently once you know what
        the list is for.
      */}
      <section className="mx-auto w-full max-w-6xl px-4 pt-10">
        <div className="rounded-card border border-ink-200 bg-paper-raised p-5 sm:p-6" data-reveal="lift">
          <h2 className="text-xl font-semibold sm:text-2xl">{t('mismatchTitle')}</h2>
          <p className="mt-2 max-w-3xl text-lg text-ink-700">{t('mismatchBody')}</p>
          <Link
            href="/about"
            className="mt-3 inline-flex min-h-touch items-center gap-1.5 font-medium text-brand-700 underline-offset-2 hover:underline"
          >
            {t('mismatchLink')}
            <IconArrowRight className="size-4.5" />
          </Link>
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
            {latest.items.map((item, index) => (
              <Card
                key={item.publicId}
                as="li"
                data-reveal="card"
                // Staggered by position so the grid settles as a wave rather
                // than snapping in as one block. Capped so a long list never
                // leaves the last card waiting on a visibly dead beat.
                style={{ '--reveal-delay': `${Math.min(index, 5) * 70}ms` } as StyleWithVars}
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
          <h2 className="text-xl font-semibold sm:text-2xl" data-reveal="lift">
            {t('tiersTitle')}
          </h2>
          <p className="mt-1 max-w-2xl text-ink-700" data-reveal="lift">
            {t('tiersBody')}
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {tiers.map((tier, index) => {
              const TierIcon = TIER_ICONS[tier.slug] ?? IconBriefcase;
              return (
                <Link
                  key={tier.publicId}
                  href={`/openings?category=${tier.publicId}`}
                  data-reveal="card"
                  style={{ '--reveal-delay': `${index * 80}ms` } as StyleWithVars}
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
        <h2 className="text-xl font-semibold sm:text-2xl" data-reveal="lift">
          {t('howItWorksTitle')}
        </h2>

        {/*
          The signature moment: scrolling here draws the graph — two people,
          the link between them, then the tick that makes it a vouch. It is
          the product's one sentence, animated, and it sits beside the steps
          that explain it rather than floating on its own.
        */}
        <div className="mt-4 grid items-center gap-6 lg:grid-cols-[1fr_auto]">
          <ol className="grid gap-3 sm:grid-cols-3">
            {steps.map((step, index) => (
              <Card
                key={step.title}
                as="li"
                data-reveal="card"
                style={{ '--reveal-delay': `${index * 90}ms` } as StyleWithVars}
                className="flex h-full gap-4"
              >
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

          {/*
            The graph, fed by the real numbers: as many nodes as there are
            people and as many edges as there are recommendations. On a
            capable device this is WebGL and it turns as you scroll; on
            anything else the same drawing renders as SVG. Either way the
            section is complete.
          */}
          <VouchGraph3d
            peopleCount={counts.activePeople}
            vouchCount={counts.recommendations}
            className="mx-auto w-64 shrink-0 text-brand-600 lg:w-80"
          />
        </div>
      </section>

      {/* ---- Trust: who stands behind this -------------------------------- */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-10">
        <Card className="flex flex-col gap-4 sm:flex-row sm:items-center" data-reveal="lift">
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
          <div className="flex items-center gap-4" data-reveal="swing">
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
