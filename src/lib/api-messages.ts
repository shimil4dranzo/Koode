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

  return { message, fieldMessage, fromKey, focusFirstInvalid };
}

/**
 * Move focus to the first field the server rejected.
 *
 * Without this, a failed submit leaves focus on the submit button. A sighted
 * user scrolls up and finds the red text; a screen-reader user is told
 * "there was a problem" and then has to hunt through the form for it, and
 * somebody using a phone keyboard has to tab back through every field.
 *
 * Queried from the DOM rather than held as refs because the field primitives
 * generate their own ids with `useId`, and `aria-invalid` is already the
 * marker they set — so this stays correct as forms change shape.
 *
 * Called on the next frame: React has to commit the error state, and therefore
 * the `aria-invalid` attributes, before there is anything to find.
 */
export function focusFirstInvalid(): void {
  requestAnimationFrame(() => {
    const invalid = document.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (!invalid) return;

    invalid.focus({ preventScroll: true });

    // Honour prefers-reduced-motion: a smooth scroll is exactly the kind of
    // movement that triggers discomfort for people who set it.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    invalid.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  });
}
