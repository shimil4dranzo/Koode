'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { ApiError } from '@/lib/api';

/**
 * Render a server error in the user's language.
 *
 * The server sends message KEYS, never sentences, so the failure path is
 * exactly as bilingual as the happy path. Three separate forms needed this,
 * which is the point at which it stops being duplication worth tolerating.
 *
 *   const { message, fieldMessage } = useApiMessages();
 *   catch (caught) { setError(message(caught)); }
 */
export function useApiMessages() {
  const t = useTranslations('errors');

  /** A key like "errors.invalidPhone" → the translated sentence. */
  const fromKey = useCallback(
    (key: string | undefined): string => {
      if (!key) return t('unexpected');

      // Keys arrive namespaced; this translator is already scoped to `errors`.
      const scoped = key.replace(/^errors\./, '');
      try {
        return t(scoped as never);
      } catch {
        // A key we have no translation for. Showing the raw key would be
        // worse than a generic message, and showing English to a Malayalam
        // reader would be worse still.
        return t('unexpected');
      }
    },
    [t],
  );

  /** Top-level message for any thrown value. */
  const message = useCallback(
    (caught: unknown): string =>
      caught instanceof ApiError ? fromKey(caught.messageKey) : t('unexpected'),
    [fromKey, t],
  );

  /** Per-field message, for wiring into a form control. */
  const fieldMessage = useCallback(
    (fields: Record<string, string>, name: string): string | undefined => {
      const key = fields[name];
      return key ? fromKey(key) : undefined;
    },
    [fromKey],
  );

  return { message, fieldMessage, fromKey };
}
