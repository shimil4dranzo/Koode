'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { ApiError, api } from '@/lib/api';
import type { LocalityOption } from '@/server/services/locality.service';

/**
 * The whole sign-in flow in one Client Component.
 *
 * Four steps, one component, because they share the phone number and the error
 * plumbing and splitting them across routes would mean either a server round
 * trip between each or passing state through the URL.
 *
 *   phone  →  code  →  register (new) or consent (text changed)  →  done
 *
 * There is no multi-step wizard chrome: each step is one field and one button,
 * because the brief is explicit that forms must be short and forgiving.
 */

type Step = 'phone' | 'code' | 'register' | 'consent';

type VerifyResponse =
  | { status: 'signed_in'; person: { publicId: string } }
  | { status: 'needs_registration'; consentVersion: string }
  | { status: 'needs_consent'; consentVersion: string };

export function SignInFlow({ localities }: { localities: LocalityOption[] }) {
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const tConsent = useTranslations('consent');
  const tErrors = useTranslations('errors');
  const locale = useLocale();
  const router = useRouter();

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [localityPublicId, setLocalityPublicId] = useState('');
  const [consentVersion, setConsentVersion] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  /**
   * Turn any failure into a message in the user's language.
   *
   * The server sends a key, never a sentence, so a Malayalam speaker never
   * sees an English error — the failure case is exactly where that matters
   * most.
   */
  function showError(caught: unknown): void {
    if (caught instanceof ApiError) {
      setFieldError(caught.fields);
      // `messageKey` is "errors.somethingSpecific"; the namespace is stripped
      // because this component's translator is already scoped to it.
      const key = caught.messageKey.replace(/^errors\./, '');
      try {
        setError(tErrors(key as never));
      } catch {
        setError(tErrors('unexpected'));
      }
      return;
    }
    setError(tErrors('unexpected'));
  }

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(null);
    setFieldError({});
    try {
      await action();
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(false);
    }
  }

  const sendCode = () =>
    run(async () => {
      const result = await api.post<{ maskedPhone: string; expiresInSeconds: number }>(
        '/api/auth/otp',
        { phone, purpose: 'login' },
      );
      setMaskedPhone(result.maskedPhone);
      setResendIn(30);
      setStep('code');
    });

  const verifyCode = () =>
    run(async () => {
      const result = await api.post<VerifyResponse>('/api/auth/verify', { phone, code });

      if (result.status === 'signed_in') {
        router.replace('/');
        router.refresh();
        return;
      }

      setConsentVersion(result.consentVersion);
      setStep(result.status === 'needs_registration' ? 'register' : 'consent');
    });

  const completeRegistration = () =>
    run(async () => {
      await api.post('/api/auth/register', {
        displayName,
        localityPublicId: localityPublicId || undefined,
        locale,
        consentVersion,
      });
      router.replace('/');
      router.refresh();
    });

  const acceptConsent = () =>
    run(async () => {
      await api.post('/api/auth/consent', { locale, consentVersion });
      router.replace('/');
      router.refresh();
    });

  return (
    <div className="mx-auto w-full max-w-md px-4 py-8">
      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-danger-600 bg-danger-100 px-4 py-3 text-danger-600"
        >
          {error}
        </p>
      ) : null}

      {step === 'phone' ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void sendCode();
          }}
          className="flex flex-col gap-5"
        >
          <div>
            <h1 className="text-2xl font-semibold">{t('signInTitle')}</h1>
            <p className="mt-2 text-ink-700">{t('signInSubtitle')}</p>
          </div>

          <TextField
            label={t('phoneLabel')}
            help={t('phoneHelp')}
            error={fieldError.phone}
            // type="tel" + numeric inputmode brings up the phone keypad, and
            // autocomplete lets the browser fill a saved number.
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            placeholder={t('phonePlaceholder')}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            required
            autoFocus
          />

          <Button type="submit" size="lg" busy={busy}>
            {t('sendCode')}
          </Button>
        </form>
      ) : null}

      {step === 'code' ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void verifyCode();
          }}
          className="flex flex-col gap-5"
        >
          <div>
            <h1 className="text-2xl font-semibold">{t('otpTitle')}</h1>
            <p className="mt-2 text-ink-700">{t('otpSubtitle', { phone: maskedPhone })}</p>
          </div>

          <TextField
            label={t('otpLabel')}
            error={fieldError.code}
            type="text"
            inputMode="numeric"
            // Lets Android and iOS offer the code straight from the SMS.
            autoComplete="one-time-code"
            maxLength={6}
            pattern="\d{6}"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            required
            autoFocus
            className="text-center text-2xl tracking-[0.4em]"
          />

          <Button type="submit" size="lg" busy={busy}>
            {t('verify')}
          </Button>

          <div className="flex flex-col gap-2 text-center">
            <Button
              variant="quiet"
              disabled={resendIn > 0 || busy}
              onClick={() => void sendCode()}
            >
              {resendIn > 0 ? t('resendIn', { seconds: resendIn }) : t('resend')}
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                setStep('phone');
                setCode('');
                setError(null);
              }}
            >
              {t('changeNumber')}
            </Button>
          </div>
        </form>
      ) : null}

      {step === 'register' ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void completeRegistration();
          }}
          className="flex flex-col gap-5"
        >
          <h1 className="text-2xl font-semibold">{t('completeProfile')}</h1>

          <TextField
            label={t('nameLabel')}
            error={fieldError.displayName}
            placeholder={t('namePlaceholder')}
            autoComplete="name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
            autoFocus
          />

          <SelectField
            label={t('localityLabel')}
            placeholder={tCommon('none')}
            options={localities.map((locality) => ({
              value: locality.publicId,
              label: locality.label,
            }))}
            value={localityPublicId}
            onChange={(event) => setLocalityPublicId(event.target.value)}
          />

          <ConsentNotice />

          <Button type="submit" size="lg" busy={busy}>
            {tConsent('accept')}
          </Button>
        </form>
      ) : null}

      {step === 'consent' ? (
        <div className="flex flex-col gap-5">
          <h1 className="text-2xl font-semibold">{tConsent('title')}</h1>
          <ConsentNotice />
          <Button size="lg" busy={busy} onClick={() => void acceptConsent()}>
            {tConsent('accept')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The consent text.
 *
 * Rendered from the same message keys that `CONSENT_VERSIONS` records, so what
 * a person saw can be reproduced from the stored version years later. A unit
 * test asserts every referenced key exists in both languages.
 */
function ConsentNotice() {
  const t = useTranslations('consent');

  return (
    <div className="rounded-card border border-ink-200 bg-ink-100 p-4 text-sm">
      <p>{t('intro')}</p>
      <ul className="mt-3 flex list-disc flex-col gap-2 ps-5">
        <li>{t('pointPhone')}</li>
        <li>{t('pointRecommendations')}</li>
        <li>{t('pointControl')}</li>
        <li>{t('pointNoSelling')}</li>
      </ul>
    </div>
  );
}
