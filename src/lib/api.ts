/**
 * Browser-side API client.
 *
 * Small on purpose. Every Client Component that talks to the server goes
 * through here so that error handling, and in particular the translation of a
 * server `messageKey` into a displayed message, happens in one place.
 *
 * The server never sends a user-facing English sentence — it sends a key that
 * the client renders in the user's language.
 */

export type ApiFailure = {
  code: string;
  messageKey: string;
  details?: { fields?: Record<string, string>; [key: string]: unknown };
  retryAfter?: number;
};

export class ApiError extends Error {
  readonly code: string;
  readonly messageKey: string;
  readonly fields: Record<string, string>;
  readonly retryAfter: number | null;

  constructor(failure: ApiFailure, retryAfter: number | null) {
    super(`${failure.code}: ${failure.messageKey}`);
    this.name = 'ApiError';
    this.code = failure.code;
    this.messageKey = failure.messageKey;
    this.fields = failure.details?.fields ?? {};
    this.retryAfter = retryAfter;
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, ...rest } = init;

  const response = await fetch(path, {
    ...rest,
    headers: {
      ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
      ...rest.headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    // Session and verification-ticket cookies are httpOnly; they ride along.
    credentials: 'same-origin',
  });

  if (response.status === 204) return undefined as T;

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const failure =
      payload && typeof payload === 'object' && 'error' in payload
        ? ((payload as { error: ApiFailure }).error)
        : { code: 'INTERNAL', messageKey: 'errors.unexpected' };

    const retryAfterHeader = response.headers.get('retry-after');
    throw new ApiError(failure, retryAfterHeader ? Number(retryAfterHeader) : null);
  }

  return (payload as { data: T }).data;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, json?: unknown) => request<T>(path, { method: 'POST', json }),
  patch: <T>(path: string, json?: unknown) => request<T>(path, { method: 'PATCH', json }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
