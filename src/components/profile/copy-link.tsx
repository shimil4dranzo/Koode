'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

/**
 * "Copy profile link" — the whole of how a seeker asks for a vouch.
 *
 * No share-sheet integration, no pre-written WhatsApp message: people here
 * already know how to paste a link into a chat, and the message they write
 * themselves is the one their neighbour will actually read.
 */
export function CopyLink({ path }: { path: string }) {
  const t = useTranslations('dashboard');
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard can be refused (insecure context, permissions). Selecting
      // the URL in a prompt is the universal fallback and needs no permission.
      window.prompt(t('copyLink'), url);
    }
  }

  return (
    <Button variant="secondary" onClick={() => void copy()}>
      {copied ? t('copied') : t('copyLink')}
    </Button>
  );
}
