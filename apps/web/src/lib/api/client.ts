import type { HttpBody } from '@greynote/contracts';
import { financialYearHeaders } from '../financial-year';
import { ApiError, NetworkError } from './ApiError';

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api';

/**
 * The refresh cookie is scoped to this path server-side, so it is not attached to every API
 * call. `credentials: 'include'` goes on these requests and NOWHERE ELSE.
 */
const COOKIE_SCOPED_PREFIX = '/identity/auth';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Bearer token. Supplied by the session layer, never read from storage here. */
  token?: string | undefined;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal | undefined;
}

/**
 * The one function every request goes through. It unwraps the envelope (`data` on success,
 * `ApiError` on failure) so no caller ever writes `if (body.success)`.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token, query, signal } = options;

  const url = new URL(BASE_URL + path);
  if (query !== undefined) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    }
  }

  const onAuthPath = path.startsWith(COOKIE_SCOPED_PREFIX);
  const headers: Record<string, string> = { Accept: 'application/json', ...financialYearHeaders() };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token !== undefined) headers['Authorization'] = `Bearer ${token}`;
  // Tells the API this is a browser (refresh token goes in the cookie, not the body) and, being
  // a custom header, forces a CORS preflight — a CSRF guard on the cookie-reading endpoints.
  if (onAuthPath) headers['X-Client'] = 'web';

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      credentials: onAuthPath ? 'include' : 'omit',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal === undefined ? {} : { signal }),
    });
  } catch (cause) {
    // An aborted request is the caller changing its mind, not a network fault.
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new NetworkError();
  }

  const payload = (await response.json().catch(() => null)) as HttpBody<T> | null;

  // No envelope means a proxy or gateway answered instead of the API.
  if (payload === null || typeof payload !== 'object' || !('success' in payload)) {
    throw new NetworkError();
  }

  if (payload.success === false) throw new ApiError(payload);

  return payload.data;
}
