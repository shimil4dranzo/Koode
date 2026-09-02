import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageGlow } from '@/components/ui/decor';
import { LogoMark, LogoWordmark } from '@/components/logo';
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

  const [t, tCommon, tApp, tAnchor, tEngagement, counts, tiers, vouches, latest] =
    await Promise.all([
      getTranslations('home'),
      getTranslations('common'),
      getTranslations('app'),
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

      {/* ---- Hero: search is the offer ------------------------------------

        Rebuilt around the one thing a marketplace hero has to do: get somebody
        into a search. Everything here is arranged behind that — the display
        type names the product, the search field is the primary control, the
        chips are the shortcut for people who do not know what to type, and the
        four proof points answer "why this and not a WhatsApp group" without a
        paragraph.

        Light rather than the dark band it replaced. The dark version looked
        striking and buried the actual entry point; on a phone the search field
        was below the fold behind two paragraphs of argument. The argument now
        lives one section down and on the About page, where somebody who wants
        it can find it and somebody who wants a job never has to read it.
      */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-6 pt-8 lg:pt-12">
        <div className="grid items-start gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div data-reveal="lift">
            {/* No mark on this line. The smile on its own is the logo's
                smile, so beside a sentence it reads as the wordmark with the
                word missing rather than as a flourish. */}
            <p className="text-base font-medium text-ink-700">{t('heroKicker')}</p>

            {/*
              Set in type, not with the logo.

              The first version dropped the wordmark in here as the second line
              of the headline. That is a misuse of a logo: a mark asserts
              identity, and it does that by appearing in one consistent form in
              a few reserved places — the header, the footer, the app frame. As
              soon as it is scaled to headline size and joined to a word, it is
              being read as typography, and the thing that made it recognisable
              everywhere else is diluted.

              So the banner says the name in the page's own display face, and
              the mark itself keeps its own places, where it stands alone.
            */}
            <h1 className="mt-3 text-5xl font-semibold uppercase leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
              <span className="block text-navy-900">{t('heroMeet')}</span>
              <span className="block text-brand-700">{tApp('name')}</span>
            </h1>

            <p className="mt-5 max-w-lg text-lg text-ink-700">{t('heroBody')}</p>

            {/*
              The primary control. A plain GET form to the openings page, so it
              works before any JavaScript arrives and the result is a URL that
              can be sent to somebody over WhatsApp.
            */}
            <form action={`/${locale}/openings`} method="get" className="mt-7 max-w-lg">
              <label htmlFor="hero-search" className="block text-base font-medium">
                {t('heroSearchLabel')}
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="hero-search"
                  type="search"
                  name="q"
                  placeholder={t('heroSearchPlaceholder')}
                  className="min-h-14 w-full rounded-lg border border-ink-300 bg-paper-raised px-4 text-lg"
                />
                <button
                  type="submit"
                  className="inline-flex min-h-14 shrink-0 items-center gap-2 rounded-lg bg-brand-600 px-6 text-lg font-medium text-white transition-colors hover:bg-brand-700"
                >
                  {tCommon('search')}
                  <IconArrowRight className="size-5" />
                </button>
              </div>
            </form>

            {/* Shortcuts for the far more common case: no idea what to type. */}
            {tiers.length > 0 ? (
              <div className="mt-5 max-w-lg">
                <p className="text-sm font-medium uppercase tracking-wide text-ink-500">
                  {t('heroPopular')}
                </p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {tiers.map((tier) => (
                    <li key={tier.publicId}>
                      <Link
                        href={`/openings?category=${tier.publicId}`}
                        className="inline-flex min-h-touch items-center rounded-full border border-ink-300 bg-paper-raised px-4 text-base transition-colors hover:border-brand-600 hover:text-brand-700"
                      >
                        {tier.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {/*
            The right column is the product, not a picture of it: real openings
            from the database in a device frame. A mock screenshot would go
            stale the first time the card design changed, and would be showing
            invented jobs on a page whose entire argument is that its listings
            are real.
          */}
          <div className="mx-auto w-full max-w-sm lg:mx-0" data-reveal="swing">
            <div className="rounded-[2rem] border-8 border-navy-900 bg-paper-raised p-3 shadow-lg">
              <p className="px-1 pb-2 pt-1">
                <LogoWordmark className="w-24" />
              </p>
              {latest.items.length > 0 ? (
                <ol className="flex flex-col gap-2">
                  {latest.items.slice(0, 3).map((item) => (
                    <li
                      key={item.publicId}
                      className="rounded-lg border border-ink-200 px-3 py-2.5"
                    >
                      <Link
                        href={`/openings/${item.publicId}`}
                        className="text-base font-medium hover:text-brand-700"
                      >
                        {item.title}
                      </Link>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-ink-700">
                        <span className="inline-flex items-center gap-1">
                          <IconMapPin className="size-4 text-ink-500" />
                          {item.localityLabel}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{tEngagement(item.engagementType)}</span>
                      </p>
                    </li>
                  ))}
                </ol>
              ) : null}
              <Link
                href="/openings"
                className="mt-2 flex min-h-touch items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 font-medium text-white hover:bg-brand-700"
              >
                {t('findWork')}
                <IconArrowRight className="size-4.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* Four proof points, in the order somebody actually asks them. */}
        <ul className="mt-10 grid gap-4 border-t border-ink-200 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: IconShield, label: t('featureVerified') },
            { icon: IconMapPin, label: t('featureNearby') },
            { icon: IconStore, label: t('featureLocal') },
            { icon: IconVouch, label: t('featureEveryone') },
          ].map((feature, index) => {
            const FeatureIcon = feature.icon;
            return (
              <li
                key={feature.label}
                className="flex items-center gap-3"
                data-reveal="card"
                style={{ '--reveal-delay': `${index * 70}ms` } as StyleWithVars}
              >
                <FeatureIcon className="size-7 shrink-0 text-brand-600" aria-hidden="true" />
                <span className="text-base font-medium">{feature.label}</span>
              </li>
            );
          })}
        </ul>

        {/*
          The promise, said plainly, signed with the mark.

          The bare smile was here first and did not read as a logo — on its own
          at this size it is a green dash. The wordmark is the thing people are
          meant to recognise, so the pill carries it.
        */}
        <p className="mt-8 inline-flex flex-wrap items-center gap-x-4 gap-y-2 rounded-full bg-navy-900 px-6 py-3.5 text-base font-medium text-white">
          <LogoWordmark tone="inverse" className="w-20" />
          <span>{t('heroTagline')}</span>
        </p>
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

      {/* ---- How it works: three columns instead of a tower ----------------

        Navy, and the only dark band left on the page. The graph is drawn with
        additive blending, which needs a dark ground to glow on — it used to
        get that from the hero, and when the hero went light this section is
        where it belongs anyway: beside the three steps that explain what the
        graph is showing, rather than behind a headline as decoration.
      */}
      <section className="border-y border-navy-800 bg-navy-900 text-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-12">
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
                tone="inverse"
                className="flex h-full gap-4"
              >
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-500 font-semibold text-navy-900"
                >
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-medium text-white">{step.title}</h3>
                  <p className="mt-1 text-navy-100">{step.body}</p>
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
        </div>
      </section>

      {/* ---- Trust: who stands behind this --------------------------------

        The claim, the evidence for it, and the count — together, because the
        claim on its own is just a sentence anyone could write. The quotes are
        the strongest thing this product has and were previously stacked beside
        the hero, where they competed with the search field for the one glance
        a visitor gives a page. Here they land after somebody has seen the
        listings and is deciding whether to believe them.
      */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-10">
        <Card className="flex flex-col gap-4 sm:flex-row sm:items-center" data-reveal="lift">
          <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl bg-verify-100 text-verify-600">
            <IconShield className="size-6" />
          </span>
          <div className="flex-1">
            <h2 className="text-lg font-semibold">{t('trustTitle')}</h2>
            <p className="mt-1 text-ink-700">{t('trustBody')}</p>
          </div>
          <dl className="flex shrink-0 gap-6 sm:border-s sm:border-ink-200 sm:ps-6">
            {stats.map((stat) => (
              <div key={stat.label}>
                <dd className="text-2xl font-semibold tabular-nums">{stat.value}</dd>
                <dt className="mt-0.5 text-sm text-ink-700">{stat.label}</dt>
              </div>
            ))}
          </dl>
        </Card>

        {vouches.length > 0 ? (
          <div className="mt-4">
            <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-ink-500">
              <IconVouch className="size-4.5 text-brand-600" />
              {t('vouchPanelTitle')}
            </p>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {vouches.map((vouch, index) => (
                <Card
                  as="li"
                  key={vouch.subjectPublicId + vouch.createdAt}
                  data-reveal="card"
                  style={{ '--reveal-delay': `${index * 80}ms` } as StyleWithVars}
                >
                  <blockquote className="line-clamp-3 border-s-4 border-brand-500 ps-3 text-base">
                    {vouch.note}
                  </blockquote>
                  <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-700">
                    <span className="font-medium text-ink-900">{vouch.referrerName}</span>
                    {vouch.referrerIsVerifiedMember ? (
                      <Badge tone="verified" glyph="\u2713">
                        {tAnchor('verified')}
                      </Badge>
                    ) : null}
                    <span aria-hidden="true">\u2192</span>
                    <Link
                      href={`/people/${vouch.subjectPublicId}`}
                      className="underline underline-offset-2 hover:text-brand-700"
                    >
                      {vouch.subjectName}
                    </Link>
                    {vouch.categoryLabel ? (
                      <span className="text-ink-500">\u00b7 {vouch.categoryLabel}</span>
                    ) : null}
                  </p>
                </Card>
              ))}
            </ul>
          </div>
        ) : null}
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
