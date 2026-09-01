import { createNavigation } from 'next-intl/navigation';
import { routing } from '@/i18n/routing';

/**
 * Locale-aware replacements for next/link and next/navigation.
 *
 * Always import Link, redirect, usePathname and useRouter from here rather
 * than from Next directly — these keep the active locale in the URL, and using
 * the Next originals silently drops the user back to the default language.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
