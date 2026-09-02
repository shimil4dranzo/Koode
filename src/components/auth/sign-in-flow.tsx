'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { LogoWordmark } from '@/components/logo';
import { PageGlow } from '@/components/ui/decor';
import { ApiError, api } from '@/lib/api';
import { useApiMessages } from '@/lib/api-messages';
import type { LocalityOption } from '@/server/services/locality.service';

/**
 * Sign in and create account, in one component.
 *
 * Since the owner's identity decision, accounts are e-mail+password or
 * Google; browsing never needs one — this screen exists for people who post
 * work or want a profile. Modes:
 *
 *   login            e-mail + password
 *   register         name, e-mail, password, locality, consent
 *   google-complete  Google verified the identity; collect name + consent
 *   consent          the consent text changed since last acceptance
 *
 * Passwords currently have no reset flow — that needs an e-mail provider,
 * which is as unchosen as the SMS one was. The form says nothing about reset
 * rather than offering a dead link.
 */

type Mode = 'login' | 'register' | 'google-complete' | 'consent';

export type GoogleDraft = { name: string; email: string };

type AuthResponse =
  | { status: 'signed_in'; person: { publicId: string } }
  | { status: 'needs_consent'; consentVersion: string };

export function SignInFlow({
  localities,
  googleEnabled,
  googleDraft,
  initialErrorKey,
}: {
  localities: LocalityOption[];
  /** True only when the server has Google credentials configured. */
  googleEnabled: boolean;
  /** Set when a Google sign-up ticket is waiting; jumps straight to completion. */
  googleDraft?: GoogleDraft;
  /** An auth.* key carried back from an OAuth redirect, if any. */
  initialErrorKey?: string;
}) {
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const tConsent = useTranslations('consent');
  const { message: apiMessage, fieldMessage, focusFirstInvalid } = useApiMessages();
  const locale = useLocale();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>(googleDraft ? 'google-complete' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState(googleDraft?.name ?? '');
  const [localityPublicId, setLocalityPublicId] = useState('');
  const [consentVersion, setConsentVersion] = useState('');

  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(() => {
    if (!initialErrorKey) return null;
    try {
      return t(initialErrorKey as never);
    } catch {
      return null;
    }
  });

  function showError(caught: unknown): void {
    if (caught instanceof ApiError) {
      setFieldError(caught.fields);
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

  function finish(): void {
    router.replace('/');
    router.refresh();
  }

  const login = () =>
    run(async () => {
      const result = await api.post<AuthResponse>('/api/auth/login', { email, password });
      if (result.status === 'needs_consent') {
        setConsentVersion(result.consentVersion);
        setMode('consent');
        return;
      }
      finish();
    });

  const register = () =>
    run(async () => {
      await api.post('/api/auth/register', {
        email,
        password,
        displayName,
        localityPublicId: localityPublicId || undefined,
        locale,
        consentVersion: CURRENT_CONSENT_VERSION_CLIENT,
      });
      finish();
    });

  const completeGoogle = () =>
    run(async () => {
      await api.post('/api/auth/register-google', {
        displayName,
        localityPublicId: localityPublicId || undefined,
        locale,
        consentVersion: CURRENT_CONSENT_VERSION_CLIENT,
      });
      finish();
    });

  const acceptConsent = () =>
    run(async () => {
      await api.post('/api/auth/consent', {
        locale,
        consentVersion,
        email,
        password,
      });
      finish();
    });

  const passwordField = (autoComplete: string) => (
    <div className="flex flex-col gap-1.5">
      <TextField
        label={t('passwordLabel')}
        help={mode === 'register' ? t('passwordHelp') : undefined}
        error={fieldMessage(fieldError, 'password')}
        type={showPassword ? 'text' : 'password'}
        autoComplete={autoComplete}
        minLength={mode === 'register' ? 8 : undefined}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
      <label className="flex min-h-touch w-fit cursor-pointer items-center gap-2 text-sm text-ink-700">
        <input
          type="checkbox"
          checked={showPassword}
          onChange={(event) => setShowPassword(event.target.checked)}
          className="size-4 rounded border border-ink-300"
        />
        {t('showPassword')}
      </label>
    </div>
  );

  /**
   * Google sign-in, or an explanation of where it went.
   *
   * The button is gated on GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET being
   * present. Hiding it in production is right — an option that cannot work
   * should not be offered — but hiding it in development with no trace is how
   * a fully-wired feature gets reported as missing. The notice below is
   * development-only, and NODE_ENV is inlined at build time, so it is not in
   * the production bundle at all. Deliberately untranslated: it addresses
   * whoever is running the dev server, not a user of the app.
   */
  const googleButton = googleEnabled ? (
    <>
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-ink-200" />
        <span className="text-sm text-ink-500">{tCommon('or')}</span>
        <span className="h-px flex-1 bg-ink-200" />
      </div>
      {/* A full-page redirect, not a popup: popups die under mobile browsers'
          blockers. A raw anchor because the route answers with a 302 to
          Google, which client navigation cannot follow. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/api/auth/google/start?mode=login"
        className="inline-flex min-h-14 items-center justify-center gap-3 rounded-lg border border-ink-300 bg-paper-raised px-6 text-lg font-medium hover:bg-ink-100"
      >
        <GoogleGlyph />
        {t('continueWithGoogle')}
      </a>
    </>
  ) : process.env.NODE_ENV === 'development' ? (
    <p className="rounded-lg border border-dashed border-ink-300 px-4 py-3 text-sm text-ink-700">
      <strong className="font-medium">Google sign-in is hidden.</strong> It is
      built and wired, but <code>GOOGLE_CLIENT_ID</code> and{' '}
      <code>GOOGLE_CLIENT_SECRET</code> are not set in <code>.env.local</code>.
      Add them and restart the dev server. (Development-only notice.)
    </p>
  ) : null;

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

      {mode === 'login' ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void login();
          }}
          className="flex flex-col gap-5"
        >
          <div>
            <LogoWordmark className="mb-5 w-28" />
            <h1 className="text-2xl font-semibold">{t('signInTitle')}</h1>
            <p className="mt-2 text-ink-700">{t('signInEmailSubtitle')}</p>
          </div>

          <TextField
            label={t('emailLabel')}
            error={fieldMessage(fieldError, 'email')}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoFocus
          />

          {passwordField('current-password')}

          <Button type="submit" size="lg" busy={busy}>
            {t('signInAction')}
          </Button>

          {googleButton}

          <p className="text-center text-ink-700">
            {t('noAccountYet')}{' '}
            <button
              type="button"
              onClick={() => setMode('register')}
              className="min-h-touch font-medium text-brand-700 underline underline-offset-2"
            >
              {t('createAccount')}
            </button>
          </p>
        </form>
      ) : null}

      {mode === 'register' ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void register();
          }}
          className="flex flex-col gap-5"
        >
          <div>
            <LogoWordmark className="mb-5 w-28" />
            <h1 className="text-2xl font-semibold">{t('createAccount')}</h1>
          </div>

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

          <TextField
            label={t('emailLabel')}
            error={fieldMessage(fieldError, 'email')}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          {passwordField('new-password')}

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

          {googleButton}

          <p className="text-center text-ink-700">
            {t('haveAccount')}{' '}
            <button
              type="button"
              onClick={() => setMode('login')}
              className="min-h-touch font-medium text-brand-700 underline underline-offset-2"
            >
              {t('signInAction')}
            </button>
          </p>
        </form>
      ) : null}

      {mode === 'google-complete' && googleDraft ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void completeGoogle();
          }}
          className="flex flex-col gap-5"
        >
          <div>
            <LogoWordmark className="mb-5 w-28" />
            <h1 className="text-2xl font-semibold">{t('completeProfile')}</h1>
            <p className="mt-2 text-ink-700">
              {t('googleCompleteSubtitle', { email: googleDraft.email })}
            </p>
          </div>

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

      {mode === 'consent' ? (
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
 * The current consent version, mirrored for the client bundle. The server
 * rejects any other value, so drift between the two constants fails loudly at
 * the first registration attempt instead of silently recording the wrong
 * version. Bump together with src/server/consent/versions.ts.
 */
const CURRENT_CONSENT_VERSION_CLIENT = '2026-09-02.1';

/**
 * The consent text, rendered from the same keys `CONSENT_VERSIONS` records so
 * what a person saw is reproducible from the stored version years later.
 */
function ConsentNotice() {
  const t = useTranslations('consent');

  return (
    <div className="rounded-card border border-ink-200 bg-ink-100 p-4 text-sm">
      <p>{t('v2.intro')}</p>
      <ul className="mt-3 flex list-disc flex-col gap-2 ps-5">
        <li>{t('v2.pointContact')}</li>
        <li>{t('v2.pointRecommendations')}</li>
        <li>{t('v2.pointControl')}</li>
        <li>{t('v2.pointNoSelling')}</li>
      </ul>
    </div>
  );
}

/** Google's "G", to brand spec. Decorative — the label carries the meaning. */
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
