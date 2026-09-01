'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useApiMessages } from '@/lib/api-messages';
import type { MembershipStatus } from '@/server/domain/constants';

/**
 * Confirming, or withdrawing, one person's membership of one organisation.
 *
 * The verified badge is the only trust signal Koode shows, so both directions
 * matter. Revoking is behind a confirmation that says what it does and does
 * not do: the badge goes, and recommendations the person already wrote stay,
 * because those were made in good faith and carry their own name.
 */
export function MembershipActions({
  anchorOrgPublicId,
  personPublicId,
  status,
}: {
  anchorOrgPublicId: string;
  personPublicId: string;
  status: MembershipStatus;
}) {
  const t = useTranslations('anchor');
  const tCommon = useTranslations('common');
  const { message: apiMessage } = useApiMessages();
  const router = useRouter();

  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const path = `/api/anchors/${anchorOrgPublicId}/members/${personPublicId}`;

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (caught) {
      setError(apiMessage(caught));
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-danger-600 bg-danger-100 px-4 py-3 text-danger-600"
        >
          {error}
        </p>
      ) : null}

      {confirming ? (
        <div className="flex flex-col gap-3 rounded-card border border-danger-600 p-4">
          <p>{t('revokeConfirm')}</p>
          <Button variant="danger" busy={busy} onClick={() => void run(() => api.delete(path))}>
            {t('revoke')}
          </Button>
          <Button variant="quiet" onClick={() => setConfirming(false)}>
            {tCommon('cancel')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {status === 'verified' ? null : (
            <Button busy={busy} onClick={() => void run(() => api.post(path))}>
              {t('verify')}
            </Button>
          )}

          {status === 'revoked' ? null : (
            <Button variant="danger" onClick={() => setConfirming(true)}>
              {t('revoke')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
