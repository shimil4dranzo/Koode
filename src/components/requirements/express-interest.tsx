'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ApiError, api } from '@/lib/api';

/**
 * "I am interested" — the low-commitment signal, for the candidate who does not
 * want to phone a stranger cold.
 *
 * Deliberately one button with no note field: anything longer would be a form,
 * and a form is the thing that stops somebody who is not confident writing.
 */

export function ExpressInterest({
  requirementPublicId,
  alreadyInterested,
}: {
  requirementPublicId: string;
  alreadyInterested: boolean;
}) {
  const t = useTranslations('requirements');
  const tErrors = useTranslations('errors');

  const [recorded, setRecorded] = useState(alreadyInterested);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function express(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/requirements/${requirementPublicId}/interest`);
      setRecorded(true);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  }

  /** Same key-not-a-sentence contract as everywhere else the client shows an error. */
  function messageFor(caught: unknown): string {
    if (!(caught instanceof ApiError)) return tErrors('unexpected');
    if (caught.code === 'RATE_LIMITED') return tErrors('tooManyRequests');
    try {
      return tErrors(caught.messageKey.replace(/^errors\./, '') as never);
    } catch {
      return tErrors('unexpected');
    }
  }

  // The prop starts it disabled; the same flag then covers the moment after a
  // successful tap, so the button never invites a second one.
  if (recorded) {
    return (
      <div className="flex flex-col gap-2">
        <Button variant="secondary" size="lg" disabled>
          {t('alreadyInterested')}
        </Button>
        {alreadyInterested ? null : (
          <p role="status" className="text-brand-700">
            {t('interestRecorded')}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-danger-600 bg-danger-100 px-4 py-3 text-danger-600"
        >
          {error}
        </p>
      ) : null}

      <Button variant="secondary" size="lg" busy={busy} onClick={() => void express()}>
        {t('expressInterest')}
      </Button>
    </div>
  );
}
