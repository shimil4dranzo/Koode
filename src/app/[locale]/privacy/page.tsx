import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { CURRENT_CONSENT_VERSION } from '@/server/consent/versions';

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'app' });
  return { title: t('privacyLink') };
}

/**
 * The privacy notice.
 *
 * Rendered from the SAME message keys that `CONSENT_VERSIONS` records, so what
 * this page says and what a person agreed to at registration cannot drift
 * apart. A unit test asserts every referenced key exists in both languages.
 *
 * This is engineering-written copy that describes the system accurately. It is
 * NOT reviewed legal text, and must be replaced before launch — see
 * ARCHITECTURE.md §Security posture.
 */
export default async function PrivacyPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, tApp, tProfile] = await Promise.all([
    getTranslations('consent'),
    getTranslations('app'),
    getTranslations('profile'),
  ]);

  const points = [
    t('pointPhone'),
    t('pointRecommendations'),
    t('pointControl'),
    t('pointNoSelling'),
  ];

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold">{tApp('privacyLink')}</h1>
      <p className="mt-1 text-sm text-ink-500">
        {t('versionNote', { version: CURRENT_CONSENT_VERSION })}
      </p>

      <p className="mt-5 text-lg">{t('intro')}</p>

      <ul className="mt-5 flex list-disc flex-col gap-4 ps-5">
        {points.map((point) => (
          <li key={point} className="text-base">
            {point}
          </li>
        ))}
      </ul>

      <Card className="mt-8">
        <h2 className="text-lg font-medium">{tProfile('exportData')}</h2>
        <p className="mt-2 text-ink-700">{tProfile('deleteWarning')}</p>
        <p className="mt-4">
          {/*
            A plain anchor, deliberately. This endpoint returns a file with a
            Content-Disposition header; next/link would client-side navigate
            and the download would never start.
          */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/api/me/export"
            className="inline-flex min-h-touch items-center rounded-lg border border-ink-300 bg-paper-raised px-4 py-2 font-medium hover:bg-ink-100"
          >
            {tProfile('exportData')}
          </a>
        </p>
      </Card>

      <p className="mt-8 text-sm text-ink-700">{tApp('byline')}</p>
    </div>
  );
}
