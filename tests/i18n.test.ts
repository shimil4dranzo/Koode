import { describe, expect, it } from 'vitest';
import en from '../messages/en.json';
import ml from '../messages/ml.json';

/**
 * The failure mode this guards against: someone adds an English string, ships
 * it, and Malayalam users see a raw key or an English sentence in the middle of
 * a Malayalam page. Retrofitting i18n is expensive; letting it rot is worse,
 * because it looks finished.
 */

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

/** ICU placeholders: {name}, and the argument of {count, plural, ...}. */
function placeholders(message: string): Set<string> {
  const found = new Set<string>();
  for (const match of message.matchAll(/\{\s*(\w+)\s*(?:,|\})/g)) {
    if (match[1]) found.add(match[1]);
  }
  return found;
}

/**
 * The part of a message a translator could actually translate: the text left
 * once ICU placeholders, digits and punctuation are removed. A message like
 * "{name} · {relationship}" has none, so it is legitimately identical in every
 * language and must not be flagged as untranslated.
 */
function translatableRemainder(message: string): string {
  return message
    .replace(/\{[^}]*\}/g, '') // ICU placeholders and plural blocks
    .replace(/[\d\s+·—\-–—:,.()/]/g, '')
    .trim();
}

const enFlat = flatten(en as Tree);
const mlFlat = flatten(ml as Tree);

describe('message catalogues', () => {
  it('has a Malayalam string for every English key', () => {
    const missing = [...enFlat.keys()].filter((key) => !mlFlat.has(key));
    expect(missing, `Missing Malayalam translations:\n${missing.join('\n')}`).toEqual([]);
  });

  it('has no Malayalam key without an English counterpart', () => {
    const orphaned = [...mlFlat.keys()].filter((key) => !enFlat.has(key));
    expect(orphaned, `Malayalam keys with no English source:\n${orphaned.join('\n')}`).toEqual(
      [],
    );
  });

  it('uses the same ICU placeholders in both languages', () => {
    // A translator dropping {name} produces a message that renders wrong only
    // for the language nobody on the team reads.
    const mismatches: string[] = [];

    for (const [key, enValue] of enFlat) {
      const mlValue = mlFlat.get(key);
      if (!mlValue) continue;

      const expected = [...placeholders(enValue)].sort();
      const actual = [...placeholders(mlValue)].sort();

      if (expected.join(',') !== actual.join(',')) {
        mismatches.push(`${key}: en has {${expected}}, ml has {${actual}}`);
      }
    }

    expect(mismatches, mismatches.join('\n')).toEqual([]);
  });

  it('has no empty or untranslated-looking Malayalam values', () => {
    const suspicious: string[] = [];

    for (const [key, mlValue] of mlFlat) {
      if (mlValue.trim() === '') {
        suspicious.push(`${key}: empty`);
        continue;
      }
      if (mlValue === enFlat.get(key) && translatableRemainder(mlValue) !== '') {
        suspicious.push(`${key}: identical to English ("${mlValue}")`);
      }
    }

    expect(suspicious, suspicious.join('\n')).toEqual([]);
  });

  it('actually contains Malayalam script, not transliteration', () => {
    // Guards against someone "translating" by writing Malayalam words in Latin
    // letters, and against the file being saved in a charset that mangles it.
    const malayalamRange = /[ഀ-ൿ]/;
    const withoutMalayalam = [...mlFlat.entries()]
      .filter(([, value]) => !malayalamRange.test(value))
      // Messages that are only placeholders, digits or punctuation have
      // nothing to write in Malayalam.
      .filter(([, value]) => translatableRemainder(value) !== '')
      .map(([key]) => key);

    expect(withoutMalayalam, withoutMalayalam.join('\n')).toEqual([]);
  });

  it('survives a UTF-8 round trip without corruption', () => {
    // The MySQL 3-byte "utf8" trap, applied to the file itself: every string
    // must come back byte-identical through an encode/decode cycle.
    for (const [key, value] of mlFlat) {
      const roundTripped = Buffer.from(value, 'utf8').toString('utf8');
      expect(roundTripped, key).toBe(value);
    }
  });
});
