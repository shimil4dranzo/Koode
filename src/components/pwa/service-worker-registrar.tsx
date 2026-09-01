'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Registers the service worker and shows an offline banner.
 *
 * Registration is deferred until after `load` so it never competes with the
 * first render for bandwidth — on the connections these users have, a service
 * worker fetching the shell while the page is still painting makes the page
 * slower, which is the opposite of the point.
 *
 * Renders nothing until the browser actually goes offline, so on the happy
 * path this component costs one event listener.
 */
export function ServiceWorkerRegistrar() {
  const t = useTranslations('pwa');
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error: unknown) => {
        // A failed registration must never break the page — the app works
        // perfectly well without a service worker, just slower on a repeat
        // visit.
        console.warn(
          '[pwa] service worker registration failed:',
          error instanceof Error ? error.message : 'unknown error',
        );
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  useEffect(() => {
    const update = () => setIsOffline(!navigator.onLine);
    update();

    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <p
      role="status"
      className="sticky top-0 z-40 bg-warn-100 px-4 py-2 text-center text-sm font-medium text-warn-600"
    >
      {t('offlineBanner')}
    </p>
  );
}
