'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

/**
 * Route-level error boundary.
 *
 * Next renders this instead of a stack trace when a Server Component throws.
 * Two things matter here:
 *
 *  - the message is translated, because a Malayalam speaker hitting an error
 *    is exactly the person least served by an English fallback
 *  - the error's own message is never displayed. It can contain a phone
 *    number from the failing row, and that must not reach the screen.
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');
  const tCommon = useTranslations('common');

  useEffect(() => {
    // The digest correlates this page with the full server-side log entry,
    // where the real message lives — scrubbed of phone numbers.
    console.error('[ui] render failed', error.digest ?? '(no digest)');
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12">
      <Card>
        <h1 className="text-xl font-semibold">{t('serverErrorTitle')}</h1>
        <p className="mt-2 text-ink-700">{t('serverErrorBody')}</p>

        <div className="mt-5">
          <Button size="lg" onClick={reset}>
            {tCommon('retry')}
          </Button>
        </div>

        {error.digest ? (
          // Shown so a user reporting the problem can quote it. It identifies
          // the log entry, not the user.
          <p className="mt-4 font-mono text-xs text-ink-500">{error.digest}</p>
        ) : null}
      </Card>
    </div>
  );
}
