import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '@/server/env';
import { errors } from '@/server/errors';

/**
 * Google sign-in, scoped deliberately.
 *
 * The phone number is Koode's identity anchor — the claim flow, contact
 * reveal and duplicate-detection all hang off it, and Google does not supply
 * one. So Google is a CONVENIENCE credential, never an identity: first
 * registration is always phone + OTP, a signed-in person may attach Google
 * from their profile, and from then on "Continue with Google" is a way to
 * skip the SMS. An unlinked Google account cannot create a profile.
 *
 * Implemented with the standard authorization-code flow and no new
 * dependency: the token exchange is one fetch, and the id_token is validated
 * by Google's own tokeninfo endpoint rather than by hand-rolling JWKS
 * verification — the boring option, and at hundreds of sign-ins a week the
 * extra round trip to Google is irrelevant.
 *
 * The whole feature is inert until GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
 * are configured, the same pattern as the SMS provider.
 */

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const TOKENINFO_ENDPOINT = 'https://oauth2.googleapis.com/tokeninfo';

const STATE_TTL_MS = 10 * 60 * 1000;

export const GOOGLE_STATE_COOKIE = 'koode_gstate';

export type GoogleMode = 'login' | 'link';

export function isGoogleSsoEnabled(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

function requireConfig(): { clientId: string; clientSecret: string; redirectUri: string } {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw errors.capabilityDisabled('errors.notFound');
  }
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: `${env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`,
  };
}

// ---------------------------------------------------------------------------
// State: CSRF binding between /start and /callback
// ---------------------------------------------------------------------------

function sign(payload: string): string {
  return createHmac('sha256', env.SESSION_SECRET)
    .update(`google-oauth-state:${payload}`)
    .digest('base64url');
}

/**
 * `mode.expiresAt.nonce.signature` — set as an httpOnly cookie AND sent as the
 * OAuth `state` parameter. The callback requires the two to match exactly
 * (double-submit) and the signature to verify, so a forged callback can
 * neither invent a state nor replay one into a different browser.
 */
export function createState(mode: GoogleMode): string {
  const payload = `${mode}.${Date.now() + STATE_TTL_MS}.${randomBytes(16).toString('base64url')}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyState(
  fromQuery: string | null,
  fromCookie: string | undefined,
): GoogleMode | null {
  if (!fromQuery || !fromCookie) return null;

  // Double-submit: the value Google echoed back must be the very cookie we
  // set. Constant-time, since one side is attacker-supplied.
  const a = Buffer.from(fromQuery);
  const b = Buffer.from(fromCookie);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const parts = fromQuery.split('.');
  if (parts.length !== 4) return null;
  const [mode, expiresAtRaw, nonce, signature] = parts as [string, string, string, string];

  const expected = Buffer.from(sign(`${mode}.${expiresAtRaw}.${nonce}`));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return null;
  }

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;

  return mode === 'login' || mode === 'link' ? mode : null;
}

// ---------------------------------------------------------------------------
// The flow itself
// ---------------------------------------------------------------------------

export function buildAuthUrl(state: string): string {
  const { clientId, redirectUri } = requireConfig();

  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  // openid+email is all this feature needs; asking for less than we could is
  // the point of scoping.
  url.searchParams.set('scope', 'openid email');
  url.searchParams.set('state', state);
  // Always show the chooser: on a shared phone, silently reusing the last
  // Google session would attach the wrong account.
  url.searchParams.set('prompt', 'select_account');

  return url.toString();
}

export type GoogleIdentity = {
  /** Google's stable account id — the only value we key on. */
  sub: string;
  email: string;
};

type TokeninfoResponse = {
  iss?: string;
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: string;
  exp?: string;
};

/**
 * Exchange the authorization code and validate the resulting id_token.
 *
 * Validation is delegated to Google's tokeninfo endpoint, then the claims are
 * checked here: issuer, audience (must be OUR client id — this is what stops
 * a token minted for some other app being replayed at us), expiry, and a
 * verified e-mail.
 */
export async function exchangeAndVerify(
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleIdentity> {
  const { clientId, clientSecret, redirectUri } = requireConfig();

  const tokenResponse = await fetchImpl(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenResponse.ok) {
    throw errors.validation('errors.unexpected');
  }

  const tokens = (await tokenResponse.json()) as { id_token?: string };
  if (!tokens.id_token) throw errors.validation('errors.unexpected');

  const infoResponse = await fetchImpl(
    `${TOKENINFO_ENDPOINT}?id_token=${encodeURIComponent(tokens.id_token)}`,
  );
  if (!infoResponse.ok) throw errors.validation('errors.unexpected');

  const info = (await infoResponse.json()) as TokeninfoResponse;

  return assertValidClaims(info, clientId);
}

/** Separated from the network so the checks themselves are unit-testable. */
export function assertValidClaims(
  info: TokeninfoResponse,
  clientId: string,
  now: number = Date.now(),
): GoogleIdentity {
  const issuerOk = info.iss === 'https://accounts.google.com' || info.iss === 'accounts.google.com';
  const audienceOk = info.aud === clientId;
  const notExpired = Number(info.exp) * 1000 > now;
  const emailOk = info.email_verified === 'true' && Boolean(info.email);

  if (!issuerOk || !audienceOk || !notExpired || !emailOk || !info.sub) {
    throw errors.validation('errors.unexpected');
  }

  return { sub: info.sub, email: info.email as string };
}
