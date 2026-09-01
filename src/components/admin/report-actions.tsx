'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useApiMessages } from '@/lib/api-messages';
import type { ReportableEntity } from '@/server/domain/constants';

/**
 * The three things a moderator can do about a report.
 *
 * Hiding and closing the report are two calls, not one, because they are two
 * decisions: content can be hidden while the report stays open for a second
 * opinion. Here they are taken together, and the second call is what removes
 * the row from the queue.
 *
 * Hiding is behind a confirmation and restoring is not — one takes something
 * away from a person who is not in the room, the other gives it back.
 */
export function ReportActions({
  reportPublicId,
  entityType,
  entityId,
  isHidden,
}: {
  reportPublicId: string;
  entityType: ReportableEntity;
  entityId: string;
  isHidden: boolean;
}) {
  const t = useTranslations('admin');
  const tCommon = useTranslations('common');
  const { message: apiMessage } = useApiMessages();
  const router = useRouter();

  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const setHidden = (hidden: boolean) =>
    run(async () => {
      await api.post('/api/moderation/hide', { entityType, entityId, hidden, reason: null });
      await api.patch(`/api/moderation/reports/${reportPublicId}`, {
        status: 'actioned',
        note: null,
      });
    });

  const dismiss = () =>
    run(() =>
      api.patch(`/api/moderation/reports/${reportPublicId}`, {
        status: 'dismissed',
        note: null,
      }),
    );

  // Suspending a person is a heavier act than hiding one posting, and the word
  // on the button has to say which one is about to happen.
  const hideLabel = entityType === 'person' ? t('suspendPerson') : t('hide');
  const restoreLabel = entityType === 'person' ? t('reinstatePerson') : t('restore');

  return (
    <div className="mt-4 flex flex-col gap-3">
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
          <p>{t('hideConfirm')}</p>
          <Button variant="danger" busy={busy} onClick={() => void setHidden(true)}>
            {hideLabel}
          </Button>
          <Button variant="quiet" onClick={() => setConfirming(false)}>
            {tCommon('cancel')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {isHidden ? (
            <Button variant="secondary" busy={busy} onClick={() => void setHidden(false)}>
              {restoreLabel}
            </Button>
          ) : (
            <Button variant="danger" onClick={() => setConfirming(true)}>
              {hideLabel}
            </Button>
          )}

          <Button variant="secondary" busy={busy} onClick={() => void dismiss()}>
            {t('dismiss')}
          </Button>
        </div>
      )}
    </div>
  );
}
