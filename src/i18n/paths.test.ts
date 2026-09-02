import { describe, expect, it } from 'vitest';
import { stripLocale } from './paths';

/**
 * The bug this guards against: `/en/openings/x` handed to next-intl's router
 * became `/en/en/openings/x`. Every case here is a path shape the sign-in and
 * OAuth flows actually produce.
 */
describe('stripLocale', () => {
  it('removes the current locale prefix', () => {
    expect(stripLocale('/en/openings/x', 'en')).toBe('/openings/x');
    expect(stripLocale('/ml/people/y?tab=1', 'ml')).toBe('/people/y?tab=1');
  });

  it('removes any known locale, not only the current one', () => {
    expect(stripLocale('/ml/openings/x', 'en')).toBe('/openings/x');
  });

  it('leaves unprefixed and unrelated paths alone', () => {
    expect(stripLocale('/openings/x', 'en')).toBe('/openings/x');
    expect(stripLocale('/english/x', 'en')).toBe('/english/x');
    expect(stripLocale('/enough', 'en')).toBe('/enough');
  });

  it('maps a bare locale to the root', () => {
    expect(stripLocale('/en', 'en')).toBe('/');
    expect(stripLocale('/en?saved=1', 'en')).toBe('/?saved=1');
    expect(stripLocale(undefined, 'en')).toBeUndefined();
  });
});
