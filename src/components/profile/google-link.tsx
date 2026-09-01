'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useApiMessages } from '@/lib/api-messages';

/**
 * Detach Google from the account.
 *
 * Client-side only for the confirm step: removing a sign-in method deserves a
 * pause, but it is never dangerous — the phone number is the identity, so the
 * SMS path always remains. Linking, by contrast, is a plain <a> to the OAuth
 * start route and needs no JavaScript at all.
 */
export function GoogleUnlink() {
  const t = useTranslations('profile');
  const tCommon = useTranslations('common');
  const { message: apiMessage } = useApiMessages();
  const router = useRouter();

  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unlink(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/auth/google/unlink');
      router.refresh();
    } catch (caught) {
      setError(apiMessage(caught));
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <Button variant="secondary" onClick={() => setConfirming(true)}>
        {t('unlinkGoogle')}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger-600">
          {error}
        </p>
      ) : null}
      <p className="text-sm text-ink-700">{t('unlinkGoogleConfirm')}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="danger" busy={busy} onClick={() => void unlink()}>
          {t('unlinkGoogle')}
        </Button>
        <Button variant="quiet" onClick={() => setConfirming(false)}>
          {tCommon('cancel')}
        </Button>
      </div>
    </div>
  );
}
