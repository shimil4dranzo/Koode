'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ApiError, api } from '@/lib/api';
import type { ContactPreference } from '@/server/domain/constants';

/**
 * The one button in Koode that hands over a phone number.
 *
 * It is a POST, not a link, because the server writes an audit record before
 * answering: a number must never be revealable by something a browser might
 * prefetch. The reveal is also rate limited, so the RATE_LIMITED case is
 * handled explicitly rather than falling into the generic error — being told
 * "wait a little" is very different from being told "something went wrong".
 */

type RevealedContact = {
  phone: string;
  contactPreference: ContactPreference;
  displayName: string;
};

export function RevealContact({
  requirementPublicId,
  contactPreference,
}: {
  requirementPublicId: string;
  contactPreference: ContactPreference;
}) {
  const t = useTranslations('requirements');
  const tErrors = useTranslations('errors');
  const tContact = useTranslations('taxonomy.contactPreference');

  const [contact, setContact] = useState<RevealedContact | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reveal(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      setContact(
        await api.post<RevealedContact>(
          `/api/requirements/${requirementPublicId}/contact`,
        ),
      );
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  }

  /**
   * The server sends a key, never a sentence, so the failure case is in the
   * user's language too. The namespace is stripped because `tErrors` is
   * already scoped to it.
   */
  function messageFor(caught: unknown): string {
    if (!(caught instanceof ApiError)) return tErrors('unexpected');
    if (caught.code === 'RATE_LIMITED') return tErrors('tooManyRequests');
    try {
      return tErrors(caught.messageKey.replace(/^errors\./, '') as never);
    } catch {
      return tErrors('unexpected');
    }
  }

  if (contact) {
    return (
      <div className="rounded-card border border-verify-600 bg-verify-100 p-4">
        <p className="text-sm font-medium text-ink-700">{t('contactRevealed')}</p>
        <a
          href={`tel:${contact.phone}`}
          className="mt-1 inline-flex min-h-touch items-center text-2xl font-semibold text-verify-600 underline underline-offset-4"
        >
          {contact.phone}
        </a>
        <p className="mt-1">{tContact(contact.contactPreference)}</p>
        <p className="mt-2 text-sm text-ink-700">{t('contactRevealNote')}</p>
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

      <Button size="lg" busy={busy} onClick={() => void reveal()}>
        {t('showContact')}
      </Button>

      {/* Said before the tap, not after: it decides which app to open. */}
      <p className="text-sm text-ink-700">{tContact(contactPreference)}</p>
    </div>
  );
}
