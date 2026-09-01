'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { SelectField, TextAreaField } from '@/components/ui/field';
import { api } from '@/lib/api';
import { useApiMessages } from '@/lib/api-messages';
import { ENGAGEMENT_OUTCOMES } from '@/server/domain/constants';
import type { EngagementOutcome, InterestStatus } from '@/server/domain/constants';

/**
 * What the employer can do about one candidate.
 *
 * Shortlisting and declining are a courtesy — they tell the candidate where
 * they stand. Recording the outcome is the one that matters to the product:
 * it is the only place Koode ever learns whether a recommendation led to real
 * work, and it can only be captured by asking, now, from the person who knows.
 *
 * Neither action is destructive, so neither is behind a confirmation: an
 * employer who declines the wrong person can shortlist them again, and an
 * outcome recorded wrongly can be corrected by recording it again.
 */
export function CandidateActions({
  requirementPublicId,
  interestPublicId,
  personPublicId,
  status,
  outcome,
}: {
  requirementPublicId: string;
  interestPublicId: string;
  personPublicId: string;
  status: InterestStatus;
  outcome: EngagementOutcome | null;
}) {
  const t = useTranslations('interest');
  const tCommon = useTranslations('common');
  const tEngagement = useTranslations('engagement');
  const tOutcome = useTranslations('engagement.outcome');
  const { message: apiMessage } = useApiMessages();
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (caught) {
      setError(apiMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  function record(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const data = new FormData(event.currentTarget);

    void run(async () => {
      await api.post(`/api/requirements/${requirementPublicId}/engagement`, {
        personPublicId,
        outcome: String(data.get('outcome') ?? ''),
        note: String(data.get('note') ?? '').trim() || null,
      });
      setRecording(false);
    });
  }

  const setStatus = (next: InterestStatus) =>
    run(() => api.patch(`/api/interest/${interestPublicId}`, { status: next }));

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

      {/* Wraps rather than shrinking: "പട്ടികയിൽ ചേർക്കുക" needs the width. */}
      <div className="flex flex-wrap gap-3">
        {status === 'shortlisted' ? null : (
          <Button busy={busy} onClick={() => void setStatus('shortlisted')}>
            {t('shortlist')}
          </Button>
        )}

        {status === 'declined' ? null : (
          <Button variant="secondary" busy={busy} onClick={() => void setStatus('declined')}>
            {t('decline')}
          </Button>
        )}

        {recording ? null : (
          <Button variant="secondary" busy={busy} onClick={() => setRecording(true)}>
            {outcome
              ? tEngagement('outcomeRecorded', { outcome: tOutcome(outcome) })
              : tEngagement('record')}
          </Button>
        )}
      </div>

      {recording ? (
        <form
          onSubmit={record}
          className="flex flex-col gap-4 rounded-card border border-ink-200 p-4"
        >
          <p className="font-medium">{tEngagement('title')}</p>
          <p className="text-sm text-ink-700">{tEngagement('subtitle')}</p>

          <SelectField
            label={tEngagement('outcomeLabel')}
            name="outcome"
            placeholder={tCommon('choose')}
            defaultValue={outcome ?? ''}
            options={ENGAGEMENT_OUTCOMES.map((value) => ({ value, label: tOutcome(value) }))}
            required
          />

          <TextAreaField label={tEngagement('noteLabel')} name="note" rows={3} maxLength={500} />

          <Button type="submit" busy={busy}>
            {tEngagement('record')}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
