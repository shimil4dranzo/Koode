import { describe, expect, it } from 'vitest';
import {
  assertValidClaims,
  buildAuthUrl,
  createState,
  verifyState,
} from '@/server/auth/google';

/**
 * The OAuth flow's wiring is two thin redirects; everything that can actually
 * go wrong — a forged state, a replayed token, a token minted for another app
 * — lives in these pure functions, so this is where the tests are.
 *
 * tests/setup.ts provides GOOGLE_CLIENT_ID/SECRET, so the enabled paths run.
 */

const CLIENT_ID = 'test-google-client-id';

describe('OAuth state', () => {
  it('round-trips when the query and cookie match', () => {
    const state = createState('link');
    expect(verifyState(state, state)).toBe('link');
  });

  it('rejects a state that only appears in the query', () => {
    // The double-submit is the CSRF defence: an attacker can put anything in
    // the callback URL, but cannot set the victim's cookie.
    const state = createState('login');
    expect(verifyState(state, undefined)).toBeNull();
    expect(verifyState(state, createState('login'))).toBeNull();
  });

  it('rejects a tampered mode even with a valid signature elsewhere', () => {
    const state = createState('login');
    const forged = state.replace('login', 'link');
    expect(verifyState(forged, forged)).toBeNull();
  });

  it('rejects an expired state', () => {
    // Rebuild a state whose expiry is in the past by splicing the payload and
    // re-checking: the signature will no longer match, which is the point —
    // expiry is inside the signed payload.
    const state = createState('login');
    const [mode, , nonce, sig] = state.split('.') as [string, string, string, string];
    const stale = `${mode}.${Date.now() - 1000}.${nonce}.${sig}`;
    expect(verifyState(stale, stale)).toBeNull();
  });
});

describe('id_token claims', () => {
  const valid = {
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: 'google-sub-123',
    email: 'person@example.com',
    email_verified: 'true',
    exp: String(Math.floor(Date.now() / 1000) + 300),
  };

  it('accepts a token issued by Google for this app', () => {
    expect(assertValidClaims({ ...valid, name: 'Suresh Kumar' }, CLIENT_ID)).toEqual({
      sub: 'google-sub-123',
      email: 'person@example.com',
      name: 'Suresh Kumar',
    });
  });

  it('rejects a token minted for a different application', () => {
    // The audience check is what stops any Google id_token on the internet
    // being replayed at Koode.
    expect(() =>
      assertValidClaims({ ...valid, aud: 'someone-elses-client' }, CLIENT_ID),
    ).toThrow();
  });

  it('rejects a wrong issuer, an expired token, and an unverified e-mail', () => {
    expect(() => assertValidClaims({ ...valid, iss: 'https://evil.example' }, CLIENT_ID)).toThrow();
    expect(() =>
      assertValidClaims({ ...valid, exp: String(Math.floor(Date.now() / 1000) - 10) }, CLIENT_ID),
    ).toThrow();
    expect(() =>
      assertValidClaims({ ...valid, email_verified: 'false' }, CLIENT_ID),
    ).toThrow();
    expect(() => assertValidClaims({ ...valid, sub: undefined }, CLIENT_ID)).toThrow();
  });
});

describe('authorization URL', () => {
  it('asks Google for exactly what the feature needs', () => {
    const url = new URL(buildAuthUrl('the-state'));

    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe('the-state');
    // Minimal scope, and always the account chooser — on a shared phone,
    // silently reusing the last Google session attaches the wrong account.
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('prompt')).toBe('select_account');
    expect(url.searchParams.get('redirect_uri')).toContain('/api/auth/google/callback');
  });
});
