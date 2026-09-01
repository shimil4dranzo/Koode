/**
 * Versioned consent text.
 *
 * The DPDP Act 2023 requires that consent be specific and demonstrable. That
 * means being able to answer, years later, "what exactly did this person agree
 * to, in which language, on which date?" — so the text is versioned here in
 * code, and `ConsentRecord` stores the version, the locale and the timestamp.
 *
 * Rules for changing this file:
 *
 *   - NEVER edit the text of a published version. Add a new one.
 *   - Old versions stay here forever, because old records reference them.
 *   - Bump CURRENT_CONSENT_VERSION when adding one.
 *   - A person whose accepted version is older than the current one is asked
 *     to accept again on their next sign-in.
 *
 * The text below is a PLACEHOLDER written by the engineering team. It states
 * accurately what the system does, but it is not legal copy and has not been
 * reviewed. Replace it with text approved for DPDP compliance before launch —
 * see ARCHITECTURE.md §Security posture.
 */

import type { ConsentPurpose } from '@/server/domain/constants';

export type ConsentVersion = {
  version: string;
  /** ISO date the version was published. */
  publishedOn: string;
  /**
   * The i18n message keys, in order, that together make up the consent text
   * shown to the user. Storing keys rather than prose keeps the wording
   * bilingual and keeps this file from drifting out of step with the UI.
   */
  messageKeys: string[];
  purpose: ConsentPurpose;
};

export const CONSENT_VERSIONS: readonly ConsentVersion[] = [
  {
    version: '2026-09-01.1',
    publishedOn: '2026-09-01',
    purpose: 'registration',
    messageKeys: [
      'consent.intro',
      'consent.pointPhone',
      'consent.pointRecommendations',
      'consent.pointControl',
      'consent.pointNoSelling',
    ],
  },
] as const;

export const CURRENT_CONSENT_VERSION = '2026-09-01.1';

export function getConsentVersion(version: string): ConsentVersion | undefined {
  return CONSENT_VERSIONS.find((entry) => entry.version === version);
}

export function getCurrentConsent(): ConsentVersion {
  const current = getConsentVersion(CURRENT_CONSENT_VERSION);
  if (!current) {
    // Unreachable unless someone bumps the constant without adding the entry.
    throw new Error(
      `CURRENT_CONSENT_VERSION "${CURRENT_CONSENT_VERSION}" has no entry in CONSENT_VERSIONS`,
    );
  }
  return current;
}

/** True when a person holding this version must accept again. */
export function needsReconsent(acceptedVersion: string | null | undefined): boolean {
  return acceptedVersion !== CURRENT_CONSENT_VERSION;
}
