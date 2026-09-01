'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useApiMessages } from '@/lib/api-messages';

/**
 * Deleting an account.
 *
 * Two taps, with what actually happens stated in between — not a modal, which
 * on a 360px screen either clips the warning or scrolls it out of reach of the
 * button. The warning is deliberately specific: the name and number go, and
 * recommendations other people wrote about them stay in anonymised form. A
 * vague "this cannot be undone" would leave somebody expecting those to vanish
 * too.
 *
 * The button that confirms is not the one that opened the step, so a stray
 * double-tap cannot pass through both.
 */
export function DangerZone() {
  const t = useTranslations('profile');
  const tCommon = useTranslations('common');
  const { message: apiMessage } = useApiMessages();
  const router = useRouter();

  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api.delete('/api/me');
      // The server has already revoked every session; `refresh` is what makes
      // the header stop showing them as signed in. `busy` stays true because
      // the navigation is the end of this component.
      router.replace('/');
      router.refresh();
    } catch (caught) {
      setError(apiMessage(caught));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border border-danger-600 p-4">
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-danger-600 bg-danger-100 px-4 py-3 text-danger-600"
        >
          {error}
        </p>
      ) : null}

      {confirming ? (
        <>
          <p className="text-ink-900">{t('deleteWarning')}</p>

          <Button variant="danger" size="lg" busy={busy} onClick={() => void remove()}>
            {t('deleteConfirm')}
          </Button>

          <Button variant="quiet" onClick={() => setConfirming(false)}>
            {tCommon('cancel')}
          </Button>
        </>
      ) : (
        <Button variant="danger" size="lg" onClick={() => setConfirming(true)}>
          {t('deleteAccount')}
        </Button>
      )}
    </div>
  );
}
