'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

/**
 * The "add Koode to your phone" prompt.
 *
 * Chrome on Android fires `beforeinstallprompt` when the app is installable
 * and lets us defer it to a moment of our choosing. Rules applied here:
 *
 *  - never on a first visit, and never interrupting a task
 *  - dismissal is remembered, so it does not nag
 *  - it renders nothing at all on browsers that do not support this, rather
 *    than showing platform-specific instructions nobody reads
 */

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISSED_KEY = 'koode.install-prompt.dismissed';

export function InstallPrompt() {
  const t = useTranslations('pwa');
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(DISMISSED_KEY) === '1';
    } catch {
      // Private browsing, or storage disabled. Treat as not dismissed; the
      // worst case is the prompt appearing again next time.
    }
    if (dismissed) return;

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as InstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  if (!deferred) return null;

  const remember = () => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Nothing to do; the prompt simply reappears on the next visit.
    }
  };

  return (
    <aside className="mx-auto mb-4 w-full max-w-3xl px-4">
      <div className="flex flex-col gap-3 rounded-card border border-brand-600 bg-brand-100 p-4 sm:flex-row sm:items-center">
        <div className="flex-1">
          <p className="font-medium">{t('installTitle')}</p>
          <p className="text-sm text-ink-700">{t('installBody')}</p>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => {
              void deferred.prompt();
              void deferred.userChoice.finally(() => {
                remember();
                setDeferred(null);
              });
            }}
          >
            {t('install')}
          </Button>
          <Button
            variant="quiet"
            onClick={() => {
              remember();
              setDeferred(null);
            }}
          >
            {t('dismiss')}
          </Button>
        </div>
      </div>
    </aside>
  );
}
