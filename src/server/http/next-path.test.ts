import { describe, expect, it } from 'vitest';
import { safeNextPath } from './next-path';

/**
 * The sign-in page redirects wherever this returns, so this is the whole of
 * the open-redirect defence. Each rejected shape below is one a browser would
 * happily follow off-site.
 */
describe('safeNextPath', () => {
  it('accepts a plain same-site path', () => {
    expect(safeNextPath('/en/openings/abc')).toBe('/en/openings/abc');
    expect(safeNextPath('/ml/people/xyz?tab=1')).toBe('/ml/people/xyz?tab=1');
  });

  it('rejects anything that could leave the site', () => {
    expect(safeNextPath('https://evil.example/')).toBeUndefined();
    expect(safeNextPath('//evil.example/path')).toBeUndefined();
    expect(safeNextPath('/\\evil.example')).toBeUndefined();
    expect(safeNextPath('/en/x?u=http://evil.example')).toBeUndefined();
    expect(safeNextPath('javascript:alert(1)')).toBeUndefined();
    expect(safeNextPath('en/openings')).toBeUndefined();
  });

  it('handles absent, repeated and oversized values', () => {
    expect(safeNextPath(undefined)).toBeUndefined();
    expect(safeNextPath('')).toBeUndefined();
    expect(safeNextPath(['/en/a', '/en/b'])).toBe('/en/a');
    expect(safeNextPath('/' + 'a'.repeat(600))).toBeUndefined();
  });
});
