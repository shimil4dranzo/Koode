'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TextField } from '@/components/ui/field';
import { api } from '@/lib/api';
import { useApiMessages } from '@/lib/api-messages';

/**
 * Accept or reject a claim invitation.
 *
 * Two rules shape this component:
 *
 *  1. Rejecting is exactly as easy as accepting. Both are full-width buttons
 *     on the same screen. Burying refusal behind a link, or an "are you sure"
 *     chain that acceptance does not have, would turn a real choice into a
 *     dark pattern — on the one screen where the choice is the entire point.
 *
 *  2. Either decision requires a code sent to the person's number. The link
 *     proves somebody received an SMS; only the code proves they hold the
 *     phone. Without it, a forwarded message would let anyone decide on their
 *     behalf.
 */

type Step = 'choose' | 'verify' | 'accepted' | 'rejected';

export function ClaimDecision({
  token,
  subjectName,
  referrerName,
}: {
  token: string;
  subjectName: string;
  referrerName: string;
}) {
  const t = useTranslations('claim');
  const tAuth = useTranslations('auth');
  const tCommon = useTranslations('common');
  const { message: apiMessage } = useApiMessages();
  const locale = useLocale();
  const router = useRouter();

  const [step, setStep] = useState<Step>('choose');
  const [decision, setDecision] = useState<'accept' | 'reject'>('accept');
  const [code, setCode] = useState('');
  const [name, setName] = useState(subjectName);
  const [maskedPhone, setMaskedPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function showError(caught: unknown): void {
    setError(apiMessage(caught));
  }

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(false);
    }
  }

  const choose = (next: 'accept' | 'reject') =>
    run(async () => {
      setDecision(next);
      const result = await api.post<{ maskedPhone: string }>(`/api/claim/${token}`, {
        action: 'request_code',
      });
      setMaskedPhone(result.maskedPhone);
      setStep('verify');
    });

  const confirm = () =>
    run(async () => {
      await api.post(`/api/claim/${token}`, {
        action: 'decide',
        decision,
        code,
        displayName: decision === 'accept' ? name : undefined,
        locale,
      });

      setStep(decision === 'accept' ? 'accepted' : 'rejected');

      if (decision === 'accept') {
        // Accepting signs them in — they have just proved control of the
        // number, so a second login would be friction with no benefit.
        router.refresh();
      }
    });

  if (step === 'accepted') {
    return (
      <Card>
        <p className="text-lg font-medium">{t('accepted')}</p>
        <Button className="mt-4" size="lg" onClick={() => router.push('/openings')}>
          {t('accept')}
        </Button>
      </Card>
    );
  }

  if (step === 'rejected') {
    return (
      <Card>
        <p className="text-lg font-medium">{t('rejected')}</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-danger-600 bg-danger-100 px-4 py-3 text-danger-600"
        >
          {error}
        </p>
      ) : null}

      {step === 'choose' ? (
        <>
          <Button size="lg" busy={busy} onClick={() => void choose('accept')}>
            {t('accept')}
          </Button>

          <Button
            size="lg"
            variant="danger"
            busy={busy}
            onClick={() => void choose('reject')}
          >
            {t('reject')}
          </Button>

          <p className="text-sm text-ink-700">
            {t('rejectConfirm', { referrer: referrerName })}
          </p>
        </>
      ) : null}

      {step === 'verify' ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void confirm();
          }}
          className="flex flex-col gap-4"
        >
          <div>
            <h2 className="text-xl font-semibold">{t('verifyTitle')}</h2>
            <p className="mt-1 text-ink-700">{t('verifySubtitle')}</p>
            {maskedPhone ? (
              <p className="mt-1 text-sm text-ink-500">{maskedPhone}</p>
            ) : null}
          </div>

          {decision === 'accept' ? (
            // The referrer typed this name from memory. Letting the person fix
            // their own name before it goes public costs one field.
            <TextField
              label={tAuth('nameLabel')}
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              required
            />
          ) : null}

          <TextField
            label={tAuth('otpLabel')}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            pattern="\d{6}"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            required
            autoFocus
            className="text-center text-2xl tracking-[0.4em]"
          />

          <Button
            type="submit"
            size="lg"
            variant={decision === 'reject' ? 'danger' : 'primary'}
            busy={busy}
          >
            {decision === 'accept' ? t('accept') : t('reject')}
          </Button>

          <Button variant="quiet" onClick={() => setStep('choose')}>
            {tCommon('back')}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
