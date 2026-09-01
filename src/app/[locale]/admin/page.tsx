import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import { Card } from '@/components/ui/card';
import { getCurrentPerson } from '@/server/auth/session';
import { canModerate } from '@/server/domain/person/rules';
import { getModerationCounts } from '@/server/services/moderation.service';

/**
 * The console.
 *
 * Two numbers and two links, because the brief scopes the console to
 * moderating content and verifying members and nothing more. There is no
 * dashboard here on purpose: at this size a person reads each report, and
 * charts would only invite decisions to be made from aggregates instead.
 */

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  return { title: t('title') };
}

export default async function AdminPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const person = await getCurrentPerson();

  /**
   * Signed out and signed in without the role are the same redirect: the
   * console is not a page that announces itself to somebody who may not see
   * it. `canModerate` is the domain rule, so the page, the services and a
   * future bot all agree on who is allowed in.
   *
   * next-intl's `redirect` throws, but its signature does not return `never`,
   * so the narrowing has to be made explicit for anything below it.
   */
  if (!person || !canModerate(person)) {
    redirect({ href: '/', locale });
    return null;
  }

  const [counts, t] = await Promise.all([
    getModerationCounts(person),
    getTranslations('admin'),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold sm:text-3xl">{t('title')}</h1>
      <p className="mt-2 text-ink-700">{t('subtitle')}</p>

      <ul className="mt-6 flex flex-col gap-3">
        <Card as="li" className="transition-colors hover:border-brand-600">
          <Link href="/admin/reports" className="flex min-h-touch flex-col gap-1">
            <span className="text-lg font-medium">{t('moderation')}</span>
            <span className="text-ink-700">
              {t('openReportCount', { count: counts.openReports })}
            </span>
          </Link>
        </Card>

        <Card as="li" className="transition-colors hover:border-brand-600">
          <Link href="/admin/members" className="flex min-h-touch flex-col gap-1">
            <span className="text-lg font-medium">{t('members')}</span>
            <span className="text-ink-700">
              {t('pendingMembershipCount', { count: counts.pendingMemberships })}
            </span>
          </Link>
        </Card>
      </ul>
    </div>
  );
}
