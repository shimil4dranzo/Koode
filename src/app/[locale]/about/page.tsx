import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Card } from '@/components/ui/card';
import { PageGlow } from '@/components/ui/decor';
import { ScrollReveal } from '@/components/scroll-reveal';
import { TownscapeArt, VouchNetworkArt } from '@/components/art';
import {
  IconArrowRight,
  IconBriefcase,
  IconMapPin,
  IconSprout,
  IconStore,
  IconVouch,
  IconWrench,
} from '@/components/icons';
import { getPlatformCounts } from '@/server/services/stats.service';
import type { StyleWithVars } from '@/lib/css';

/**
 * Why Koode exists.
 *
 * The home page sells the product; this page makes the argument. They are
 * deliberately different jobs, which is why this is a page rather than another
 * band on the front: the case rests on a claim that takes a few sentences to
 * land — that the constraint on local employment is not a shortage of work but
 * a shortage of visibility between two groups who are both already searching.
 * A visitor who wants a job should never have to read it, and a visitor
 * deciding whether to trust the platform should be able to read nothing else.
 *
 * Every claim here is one the product can keep. The six kinds of work listed
 * are all reachable in the taxonomy — the remote and digital tier was added
 * alongside this page precisely so that this section describes the app rather
 * than an ambition for it.
 */

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'about' });
  return { title: t('metaTitle') };
}

export default async function AboutPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, tHome, counts] = await Promise.all([
    getTranslations('about'),
    getTranslations('home'),
    getPlatformCounts(),
  ]);

  // The six kinds of work the platform covers, each tied to an icon that
  // already means that thing elsewhere in the app.
  const breadth = [
    { icon: IconBriefcase, label: t('breadthFullTime') },
    { icon: IconSprout, label: t('breadthPartTime') },
    { icon: IconWrench, label: t('breadthLocalServices') },
    { icon: IconVouch, label: t('breadthCallCentre') },
    { icon: IconMapPin, label: t('breadthDigital') },
    { icon: IconStore, label: t('breadthCorporate') },
  ];

  return (
    <div className="relative">
      <ScrollReveal />
      <PageGlow />

      {/* ---- The thesis ---------------------------------------------------- */}
      <section className="mx-auto w-full max-w-4xl px-4 pb-6 pt-10 lg:pt-16">
        <p className="text-sm font-medium uppercase tracking-wide text-ink-500">
          {t('eyebrow')}
        </p>
        <h1
          className="mt-4 text-balance text-3xl font-semibold sm:text-4xl lg:text-5xl"
          data-reveal="lift"
        >
          {t('title')}
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-ink-700" data-reveal="lift">
          {t('lede')}
        </p>
      </section>

      {/* ---- The problem: two sides who cannot see each other -------------- */}
      <section className="mx-auto w-full max-w-4xl px-4 py-10">
        <h2 className="text-xl font-semibold sm:text-2xl">{t('problemTitle')}</h2>
        <p className="mt-3 max-w-2xl text-lg text-ink-700">{t('problemBody')}</p>

        {/*
          Two columns, deliberately equal in weight. The argument is that
          neither side is at fault and neither is the customer — so neither
          card is styled as the primary one.
        */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {[
            { label: t('problemSeekerLabel'), body: t('problemSeekerBody') },
            { label: t('problemEmployerLabel'), body: t('problemEmployerBody') },
          ].map((side, index) => (
            <Card
              key={side.label}
              data-reveal="card"
              style={{ '--reveal-delay': `${index * 90}ms` } as StyleWithVars}
            >
              <p className="text-sm font-medium uppercase tracking-wide text-ink-500">
                {side.label}
              </p>
              <p className="mt-2 text-base">{side.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ---- The answer ---------------------------------------------------- */}
      <section className="border-y border-ink-200 bg-paper-raised">
        <div className="mx-auto grid w-full max-w-4xl items-center gap-8 px-4 py-10 lg:grid-cols-[1fr_auto]">
          <div>
            <h2 className="text-xl font-semibold sm:text-2xl">{t('answerTitle')}</h2>
            <p className="mt-3 text-lg text-ink-700">{t('answerBody')}</p>
          </div>
          <VouchNetworkArt
            animated
            className="mx-auto h-auto w-56 text-brand-600 lg:w-64"
          />
        </div>
      </section>

      {/* ---- Breadth: not only a job portal -------------------------------- */}
      <section className="mx-auto w-full max-w-4xl px-4 py-10">
        <h2 className="text-xl font-semibold sm:text-2xl">{t('breadthTitle')}</h2>
        <p className="mt-3 max-w-2xl text-lg text-ink-700">{t('breadthBody')}</p>

        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {breadth.map((kind, index) => {
            const KindIcon = kind.icon;
            return (
              <Card
                as="li"
                key={kind.label}
                data-reveal="card"
                style={{ '--reveal-delay': `${index * 70}ms` } as StyleWithVars}
                className="flex items-center gap-3"
              >
                <KindIcon className="size-6 shrink-0 text-brand-600" aria-hidden="true" />
                <span className="text-base font-medium">{kind.label}</span>
              </Card>
            );
          })}
        </ul>

        <p className="mt-4 text-base text-ink-500">
          <Link
            href="/openings"
            className="inline-flex min-h-touch items-center gap-1.5 font-medium text-brand-700 underline-offset-2 hover:underline"
          >
            {t('ctaSeeker')}
            <IconArrowRight className="size-4.5" />
          </Link>
        </p>
      </section>

      {/* ---- The ecosystem, and the way in --------------------------------- */}
      <section className="relative overflow-hidden border-t border-ink-200 bg-brand-700 text-white">
        <TownscapeArt
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 end-0 hidden h-full w-auto opacity-20 lg:block"
        />
        <div className="relative mx-auto w-full max-w-4xl px-4 py-10">
          <h2 className="text-xl font-semibold sm:text-2xl">{t('ecosystemTitle')}</h2>
          <p className="mt-3 max-w-2xl text-lg text-brand-100">{t('ecosystemBody')}</p>

          {/* The real numbers, so the closing claim is checkable rather than
              rhetorical. Labelled: three bare figures say nothing, and the
              labels are already written for the home page. */}
          <dl className="mt-6 grid max-w-md grid-cols-3 gap-4 border-t border-white/20 pt-5">
            {[
              { label: tHome('statPeople'), value: counts.activePeople },
              { label: tHome('statRecommendations'), value: counts.recommendations },
              { label: tHome('statOpenings'), value: counts.openRequirements },
            ].map((stat) => (
              <div key={stat.label}>
                <dd className="text-2xl font-semibold tabular-nums">{stat.value}</dd>
                <dt className="mt-0.5 text-sm text-brand-100">{stat.label}</dt>
              </div>
            ))}
          </dl>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/openings"
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-lg bg-brand-500 px-6 text-lg font-medium text-night-900 hover:bg-brand-100"
            >
              {t('ctaSeeker')}
              <IconArrowRight className="size-5" />
            </Link>
            <Link
              href="/openings/new"
              className="inline-flex min-h-14 items-center justify-center rounded-lg border border-white/30 px-6 text-lg font-medium text-white hover:bg-white/10"
            >
              {t('ctaEmployer')}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
