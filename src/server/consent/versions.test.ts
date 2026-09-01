import { describe, expect, it } from 'vitest';
import {
  CONSENT_VERSIONS,
  CURRENT_CONSENT_VERSION,
  getConsentVersion,
  getCurrentConsent,
  needsReconsent,
} from '@/server/consent/versions';
import en from '../../../messages/en.json';
import ml from '../../../messages/ml.json';

function lookup(catalogue: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined,
      catalogue,
    );
}

describe('consent versioning', () => {
  it('resolves the current version', () => {
    expect(getCurrentConsent().version).toBe(CURRENT_CONSENT_VERSION);
  });

  it('has unique version identifiers', () => {
    const versions = CONSENT_VERSIONS.map((entry) => entry.version);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it('requires re-consent for an older or missing version', () => {
    expect(needsReconsent(null)).toBe(true);
    expect(needsReconsent(undefined)).toBe(true);
    expect(needsReconsent('1999-01-01.1')).toBe(true);
    expect(needsReconsent(CURRENT_CONSENT_VERSION)).toBe(false);
  });

  it('keeps every historic version resolvable', () => {
    // Old ConsentRecord rows point at these. If a version disappears, we can
    // no longer say what a person agreed to — which is the whole obligation.
    for (const entry of CONSENT_VERSIONS) {
      expect(getConsentVersion(entry.version)).toBeDefined();
    }
  });

  it('references message keys that exist in both languages', () => {
    // A consent screen that renders a raw key, or renders English to a
    // Malayalam speaker, is not informed consent.
    for (const entry of CONSENT_VERSIONS) {
      expect(entry.messageKeys.length).toBeGreaterThan(0);

      for (const key of entry.messageKeys) {
        expect(typeof lookup(en, key), `en: ${key}`).toBe('string');
        expect(typeof lookup(ml, key), `ml: ${key}`).toBe('string');
      }
    }
  });
});
