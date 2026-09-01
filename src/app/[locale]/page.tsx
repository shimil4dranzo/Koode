import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Card } from '@/components/ui/card';
import { getPlatformCounts } from '@/server/services/stats.service';

type PageProps = { params: Promise<{ locale: string }> };

export default async function HomePage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, counts] = await Promise.all([
    getTranslations('home'),
    getPlatformCounts(),
  ]);

  const steps = [
    { title: t('step1Title'), body: t('step1Body') },
    { title: t('step2Title'), body: t('step2Body') },
    { title: t('step3Title'), body: t('step3Body') },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <section>
        <h1 className="text-2xl font-semibold sm:text-3xl">{t('heroTitle')}</h1>
        <p className="mt-3 text-lg text-ink-700">{t('heroBody')}</p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/openings"
            className="inline-flex min-h-14 items-center justify-center rounded-lg bg-brand-600 px-6 text-lg font-medium text-white hover:bg-brand-700"
          >
            {t('findWork')}
          </Link>
          <Link
            href="/openings/new"
            className="inline-flex min-h-14 items-center justify-center rounded-lg border border-ink-300 bg-paper-raised px-6 text-lg font-medium hover:bg-ink-100"
          >
            {t('postWork')}
          </Link>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">{t('howItWorksTitle')}</h2>
        <ol className="mt-4 flex flex-col gap-3">
          {steps.map((step, index) => (
            <Card key={step.title} as="li" className="flex gap-4">
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

      <section className="mt-10">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { label: t('statOpenings'), value: counts.openRequirements },
            { label: t('statPeople'), value: counts.activePeople },
            { label: t('statRecommendations'), value: counts.recommendations },
          ].map((stat) => (
            <Card key={stat.label} className="text-center">
              <dt className="text-sm text-ink-700">{stat.label}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{stat.value}</dd>
            </Card>
          ))}
        </dl>
      </section>
    </div>
  );
}
