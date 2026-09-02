'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ApiError, api } from '@/lib/api';
import type { InterestStatus } from '@/server/domain/constants';

/**
 * The employer's side of "direct contact": once a candidate is shortlisted,
 * one tap shows how to reach them.
 *
 * Deliberately not shown until the candidate IS shortlisted — the button does
 * not appear disabled, it is replaced by a sentence saying what unlocks it.
 * A disabled button on a phone is a thing people tap three times.
 */

type CandidateContact = {
  displayName: string;
  phone: string | null;
  contactEmail: string | null;
};

export function RevealCandidateContact({
  interestPublicId,
  status,
}: {
  interestPublicId: string;
  status: InterestStatus;
}) {
  const t = useTranslations('interest');
  const tErrors = useTranslations('errors');

  const [contact, setContact] = useState<CandidateContact | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reveal(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      setContact(await api.post<CandidateContact>(`/api/interest/${interestPublicId}/contact`));
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  }

  function messageFor(caught: unknown): string {
    if (!(caught instanceof ApiError)) return tErrors('unexpected');
    if (caught.code === 'RATE_LIMITED') return tErrors('tooManyRequests');
    try {
      return tErrors(caught.messageKey.replace(/^errors\./, '') as never);
    } catch {
      return tErrors('unexpected');
    }
  }

  if (status !== 'shortlisted') {
    return <p className="text-sm text-ink-700">{t('shortlistToContact')}</p>;
  }

  if (contact) {
    return (
      <div className="rounded-lg border border-brand-600 bg-brand-100/50 px-4 py-3">
        <p className="text-sm font-medium text-ink-700">{t('contactShown')}</p>
        {contact.phone ? (
          <a href={`tel:${contact.phone}`} className="mt-1 block text-lg font-semibold underline-offset-2 hover:underline">
            {contact.phone}
          </a>
        ) : null}
        {contact.contactEmail ? (
          <a href={`mailto:${contact.contactEmail}`} className="mt-1 block underline underline-offset-2">
            {contact.contactEmail}
          </a>
        ) : null}
        <p className="mt-2 text-sm text-ink-700">{t('contactNote')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p role="alert" className="rounded-lg border border-danger-600 bg-danger-100 px-4 py-3 text-danger-600">
          {error}
        </p>
      ) : null}
      <Button size="md" busy={busy} onClick={() => void reveal()}>
        {t('revealContact')}
      </Button>
    </div>
  );
}
