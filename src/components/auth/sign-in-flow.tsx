'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { LogoMark } from '@/components/logo';
import { PageGlow } from '@/components/ui/decor';
import { ApiError, api } from '@/lib/api';
import { useApiMessages } from '@/lib/api-messages';
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

export function SignInFlow({
  localities,
  googleEnabled,
  initialErrorKey,
}: {
  localities: LocalityOption[];
  /** True only when the server has Google credentials configured. */
  googleEnabled: boolean;
  /** An auth.* key carried back from an OAuth redirect, if any. */
  initialErrorKey?: string;
}) {
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const tConsent = useTranslations('consent');
  const { message: apiMessage, fieldMessage, focusFirstInvalid } = useApiMessages();
  const locale = useLocale();
  const router = useRouter();

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [localityPublicId, setLocalityPublicId] = useState('');
  const [consentVersion, setConsentVersion] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    if (!initialErrorKey) return null;
    try {
      return t(initialErrorKey as never);
    } catch {
      return null;
    }
  });
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
      // Send the user to the field that is actually wrong, rather than
      // leaving focus on the submit button they just pressed.
      if (Object.keys(caught.fields).length > 0) focusFirstInvalid();
    }
    setError(apiMessage(caught));
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
      const result = await api.post<{
        maskedPhone: string;
        expiresInSeconds: number;
        devCode?: string;
      }>('/api/auth/otp', { phone, purpose: 'login' });
      setMaskedPhone(result.maskedPhone);
      setDevCode(result.devCode ?? null);
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
    <div className="relative mx-auto w-full max-w-md px-4 py-8">
      <PageGlow />
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
            <LogoMark className="mb-4 size-12" />
            <h1 className="text-2xl font-semibold">{t('signInTitle')}</h1>
            <p className="mt-2 text-ink-700">{t('signInSubtitle')}</p>
          </div>

          <TextField
            label={t('phoneLabel')}
            help={t('phoneHelp')}
            error={fieldMessage(fieldError, 'phone')}
            // type="tel" + numeric inputmode brings up the phone keypad, and
            // autocomplete lets the browser fill a saved number.
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            // Deliberately permissive: it catches letters or an obviously
            // short number without a round trip, and cannot reject a spelling
            // the server would accept. A stricter client pattern would have
            // to restate normalizePhone's rules, and the day the two drift a
            // user is locked out of their own number.
            pattern="[0-9+()\s-]{10,17}"
            maxLength={17}
            placeholder={t('phonePlaceholder')}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            required
            autoFocus
          />

          <Button type="submit" size="lg" busy={busy}>
            {t('sendCode')}
          </Button>

          {googleEnabled ? (
            <>
              <div className="flex items-center gap-3" aria-hidden="true">
                <span className="h-px flex-1 bg-ink-200" />
                <span className="text-sm text-ink-500">{tCommon('or')}</span>
                <span className="h-px flex-1 bg-ink-200" />
              </div>

              {/* A full-page redirect, not a popup: popups die under mobile
                  browsers' blockers, and this is a phone-first product. A raw
                  anchor on purpose — the route answers with a 302 to Google,
                  which next/link's client navigation cannot follow. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/api/auth/google/start?mode=login"
                className="inline-flex min-h-14 items-center justify-center gap-3 rounded-lg border border-ink-300 bg-paper-raised px-6 text-lg font-medium hover:bg-ink-100"
              >
                <GoogleGlyph />
                {t('continueWithGoogle')}
              </a>
              <p className="text-sm text-ink-700">{t('googleHint')}</p>
            </>
          ) : null}
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
            {devCode ? (
              // Development only: the server includes the code solely when it
              // is running a dev build with the console SMS stub, where no
              // message is actually delivered anywhere.
              <p className="mt-3 rounded-lg border border-warn-600 bg-warn-100 px-3 py-2 text-sm">
                {t('devCodeNotice')}{' '}
                <strong className="font-mono text-base tracking-widest">{devCode}</strong>
              </p>
            ) : null}
          </div>

          <TextField
            label={t('otpLabel')}
            error={fieldMessage(fieldError, 'code')}
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
            error={fieldMessage(fieldError, 'displayName')}
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

/**
 * Google's "G", drawn to their brand spec colours. Decorative — the button
 * label carries the meaning.
 */
function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-5.5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3c-1.08.72-2.46 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.27a12 12 0 0 0 0 10.78l4.01-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.76c1.76 0 3.34.6 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.61l4.01 3.1C6.22 6.87 8.87 4.76 12 4.76Z"
      />
    </svg>
  );
}
