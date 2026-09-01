import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, EmptyState } from '@/components/ui/card';
import { ReportActions } from '@/components/admin/report-actions';
import { getCurrentPerson } from '@/server/auth/session';
import { canModerate } from '@/server/domain/person/rules';
import { listReports } from '@/server/services/moderation.service';

/**
 * The moderation queue.
 *
 * Oldest first, everything on one card: the reason, what the reporter wrote,
 * and enough of the reported thing to judge it without leaving the page. There
 * is no triage scoring and no bulk action — a person reads each of these, and
 * the volume at this size does not justify tooling that would make it easier
 * to hide things without looking at them.
 */

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin' });
  return { title: t('moderation') };
}

/** Where a moderator can go to see the reported thing in context. */
function subjectHref(entityType: string, entityId: string): string | null {
  if (entityType === 'requirement') return `/openings/${entityId}`;
  if (entityType === 'person') return `/people/${entityId}`;
  // A recommendation has no page of its own; the summary on the card is it.
  return null;
}

export default async function AdminReportsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const person = await getCurrentPerson();
  // next-intl's `redirect` throws, but its signature does not return `never`,
  // so the narrowing has to be made explicit for anything below it.
  if (!person || !canModerate(person)) {
    redirect({ href: '/', locale });
    return null;
  }

  const [reports, t, tCommon, tReport, tReason, tEntity, format] = await Promise.all([
    listReports('open', person, locale),
    getTranslations('admin'),
    getTranslations('common'),
    getTranslations('report'),
    getTranslations('report.reason'),
    getTranslations('taxonomy.reportableEntity'),
    getFormatter(),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold sm:text-3xl">{t('moderation')}</h1>

      {reports.length === 0 ? (
        <div className="mt-6">
          <EmptyState title={t('noReports')} />
        </div>
      ) : (
        <ol className="mt-6 flex flex-col gap-4">
          {reports.map((report) => {
            const href = subjectHref(report.entityType, report.entityId);

            return (
              <Card key={report.publicId} as="li">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <Badge>{tEntity(report.entityType)}</Badge>
                  <Badge tone="warn">{tReason(report.reason)}</Badge>
                  {report.isHidden ? <Badge tone="danger">{t('hidden')}</Badge> : null}
                </div>

                <h2 className="mt-3 text-sm font-medium text-ink-700">{t('subjectLabel')}</h2>
                <p className="mt-1 whitespace-pre-line text-ink-900">
                  {report.subjectSummary ?? t('subjectMissing')}
                </p>

                {href ? (
                  <p className="mt-2">
                    <Link href={href} className="underline underline-offset-2">
                      {t('openSubject')}
                    </Link>
                  </p>
                ) : null}

                {report.detail ? (
                  <>
                    <h2 className="mt-4 text-sm font-medium text-ink-700">
                      {tReport('detailLabel')}
                    </h2>
                    <p className="mt-1 whitespace-pre-line text-ink-900">{report.detail}</p>
                  </>
                ) : null}

                <p className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink-500">
                  <span>
                    {t('reportedBy', {
                      name: report.reporterName ?? t('anonymousReporter'),
                    })}
                  </span>
                  <span>
                    {t('reportedOn', {
                      date: format.dateTime(new Date(report.createdAt), 'short'),
                    })}
                  </span>
                </p>

                <ReportActions
                  reportPublicId={report.publicId}
                  entityType={report.entityType}
                  entityId={report.entityId}
                  isHidden={report.isHidden}
                />
              </Card>
            );
          })}
        </ol>
      )}

      <p className="mt-8">
        <Link href="/admin" className="underline underline-offset-2">
          {tCommon('back')}
        </Link>
      </p>
    </div>
  );
}
