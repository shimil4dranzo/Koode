import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { ServiceWorkerRegistrar } from '@/components/pwa/service-worker-registrar';
import { InstallPrompt } from '@/components/pwa/install-prompt';
import '@/app/globals.css';

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

/** Pre-render both locales at build time rather than on first request. */
export function generateStaticParams(): Array<{ locale: string }> {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: Omit<LayoutProps, 'children'>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'app' });

  return {
    title: { default: t('name'), template: `%s · ${t('name')}` },
    description: t('tagline'),
    applicationName: t('name'),
    manifest: '/manifest.webmanifest',
    appleWebApp: { capable: true, statusBarStyle: 'default', title: t('name') },
    formatDetection: { telephone: false },
    // This is a private local platform, not a public directory of people.
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Never block zoom: some users need to enlarge text to read it at all.
  maximumScale: 5,
  userScalable: true,
  themeColor: '#1c6b45',
};

export default async function LocaleLayout({ children, params }: LayoutProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Required for static rendering of the pages beneath this layout.
  setRequestLocale(locale);

  const t = await getTranslations('common');

  return (
    <html lang={locale}>
      <body className="min-h-dvh flex flex-col bg-paper text-ink-900 antialiased">
        <NextIntlClientProvider>
          <a
            href="#main"
            className="sr-only-focusable absolute z-50 m-2 rounded-md bg-ink-900 px-4 py-2 text-paper"
          >
            {t('skipToContent')}
          </a>
          <ServiceWorkerRegistrar />
          <SiteHeader />
          <main id="main" className="flex-1 w-full">
            {children}
          </main>
          <InstallPrompt />
          <SiteFooter />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
