import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ClaimDecision } from '@/components/claim/claim-decision';
import { getClaimPreview } from '@/server/services/claim.service';
import { isAppError } from '@/server/errors';
import type { RelationshipContext } from '@/server/domain/constants';

type PageProps = { params: Promise<{ locale: string; token: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'claim' });

  return {
    title: t('title'),
    // Belt and braces on top of the site-wide setting: this URL contains a
    // secret and must never be indexed or previewed.
    robots: { index: false, follow: false, nocache: true },
  };
}

/**
 * The claim page.
 *
 * Somebody entered this person's name and number without them present. This
 * page is where that person finds out, and decides.
 *
 * The order on screen is deliberate and is the whole design: they see WHO
 * recommended them and WHAT was written BEFORE they are asked to do anything,
 * and "remove my details" sits next to "list my profile" with equal weight.
 * Consent that is not informed, and refusal that is harder than acceptance,
 * would both make this theatre.
 */
export default async function ClaimPage({ params }: PageProps) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  const [t, tTaxonomy, format] = await Promise.all([
    getTranslations('claim'),
    getTranslations('taxonomy'),
    getFormatter(),
  ]);

  let preview;
  try {
    preview = await getClaimPreview(token);
  } catch (error) {
    // An expired, used or bogus token. Say which, in plain words, rather than
    // showing a generic 404 to somebody who was told to expect this link.
    const messageKey = isAppError(error) ? error.messageKey : 'claim.invalid';
    const key = messageKey.replace(/^claim\./, '');

    return (
      <div className="mx-auto w-full max-w-md px-4 py-10">
        <Card>
          <h1 className="text-xl font-semibold">{t('title')}</h1>
          <p className="mt-3 text-ink-700">
            {key === 'expired' ? t('expired') : t('invalid')}
          </p>
        </Card>
      </div>
    );
  }

  const relationship = preview.relationshipContext
    ? tTaxonomy(`relationshipContext.${preview.relationshipContext}` as never)
    : null;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-8">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>

      <p className="mt-3 text-lg text-ink-700">
        {t('intro', { referrer: preview.referrerName })}
      </p>

      {preview.referrerIsVerifiedMember ? (
        <p className="mt-2">
          <Badge tone="verified" glyph="✓">
            {preview.referrerName}
          </Badge>
        </p>
      ) : null}

      {preview.note ? (
        <Card className="mt-5">
          <h2 className="text-sm font-medium uppercase tracking-wide text-ink-500">
            {t('whatTheySaid')}
          </h2>
          {/* Verbatim. Paraphrasing what was written about somebody, on the
              screen where they decide whether to allow it, would be dishonest. */}
          <blockquote className="mt-2 whitespace-pre-line border-s-4 border-brand-500 ps-3 text-lg">
            {preview.note}
          </blockquote>
          {relationship ? (
            <p className="mt-3 text-sm text-ink-700">
              {t('relationship', { relationship })}
            </p>
          ) : null}
        </Card>
      ) : null}

      <Card className="mt-4 bg-ink-100">
        <p>{t('yourDetails', { name: preview.subjectName, phone: preview.maskedPhone })}</p>
        <p className="mt-3 font-medium">
          {t('explain', {
            expiryDate: format.dateTime(new Date(preview.expiresAt), 'short'),
          })}
        </p>
      </Card>

      <div className="mt-6">
        <ClaimDecision token={token} subjectName={preview.subjectName} referrerName={preview.referrerName} />
      </div>
    </div>
  );
}
