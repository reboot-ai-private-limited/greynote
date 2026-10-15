import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { clearSession, getTokens, setTokens } from './session';

/**
 * The API's base URL, including the `/api` prefix. Set EXPO_PUBLIC_API_URL to override it
 * (e.g. a deployed server). Otherwise it's derived from the machine running the Expo dev server,
 * so a phone in Expo Go reaches the API on the PC's LAN IP rather than its own `localhost`.
 * apps/api listens on PORT 3000 by default.
 */
function resolveBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, '');
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:3000/api`;
  return `http://${Platform.OS === 'android' ? '10.0.2.2' : 'localhost'}:3000/api`;
}

export const API_BASE_URL = resolveBaseUrl();

/** The backend's error envelope: `{ success: false, statusCode, code, message, data? }`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly data?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** A network failure (server down, wrong IP, no Wi-Fi) — no HTTP response at all. */
export class NetworkError extends Error {}

/**
 * `fy`: send the financial-year header for the year the MR picked (lib/financial-year.ts). Only reads pass it:
 * the server refuses every write while a past year is selected, so sync and saves must never carry it.
 */
type Options = { auth?: boolean; fy?: boolean };

let financialYearHeader: string | null = null;
/** Set by lib/financial-year.ts: the start year of a past financial year, or null for the current one. */
export const setFinancialYearHeader = (year: number | null) => {
  financialYearHeader = year === null ? null : String(year);
};

async function send<T>(method: string, path: string, body: unknown, accessToken?: string, extraHeaders?: Record<string, string>) {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        // Without this the server treats us as a browser and keeps the refresh token out of the body.
        'X-Client': 'mobile',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...extraHeaders,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new NetworkError(`Can’t reach the server at ${API_BASE_URL}.`);
  }

  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    throw new ApiError(
      response.status,
      json?.message ?? 'Something went wrong. Please try again.',
      json?.data,
    );
  }
  return json.data as T;
}

/**
 * One refresh at a time: the server rotates the refresh token, and presenting an already-rotated
 * one is treated as theft and revokes every session (hld/04 §1). Parallel 401s share this promise.
 */
let refreshing: Promise<boolean> | null = null;

function refreshTokens(): Promise<boolean> {
  refreshing ??= (async () => {
    const current = getTokens();
    if (!current) return false;
    try {
      const next = await send<{ accessToken: string; refreshToken: string }>(
        'POST',
        '/identity/auth/refresh',
        { refreshToken: current.refreshToken },
      );
      await setTokens({ accessToken: next.accessToken, refreshToken: next.refreshToken });
      return true;
    } catch (err) {
      // Only a definite rejection ends the session; a dropped connection must not log the MR out.
      if (err instanceof NetworkError) throw err;
      if (err instanceof ApiError && err.status === 401) await clearSession();
      return false;
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function request<T>(method: string, path: string, body?: unknown, opts: Options = {}) {
  if (!opts.auth) return send<T>(method, path, body);
  const extra = opts.fy && method === 'GET' && financialYearHeader ? { 'X-Financial-Year': financialYearHeader } : undefined;

  try {
    return await send<T>(method, path, body, getTokens()?.accessToken, extra);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) throw err;
    if (!(await refreshTokens())) throw err;
    return send<T>(method, path, body, getTokens()?.accessToken, extra);
  }
}

/** A file picked on the phone, as expo-document-picker gives it. */
export type UploadFile = { uri: string; name: string; mimeType?: string | null };

/**
 * Sends one picked file as multipart/form-data. This uses React Native's own XMLHttpRequest and its
 * { uri, name, type } file part: the system reads the file, so the app never has to. (The app's fetch
 * refuses that part, and Expo Go refuses expo-file-system "READ" permission on the picker's cache folder.)
 */
function sendFile<T>(path: string, file: UploadFile, accessToken?: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const form = new FormData();
    form.append('file', { uri: file.uri, name: file.name, type: file.mimeType ?? 'application/octet-stream' } as unknown as Blob);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}${path}`);
    // No Content-Type: the multipart boundary is set for us.
    xhr.setRequestHeader('X-Client', 'mobile');
    xhr.setRequestHeader('Accept', 'application/json');
    if (accessToken) xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.onerror = () => reject(new NetworkError(`Can’t reach the server at ${API_BASE_URL}.`));
    xhr.ontimeout = () => reject(new NetworkError('The upload took too long. Check your connection and try again.'));
    xhr.timeout = 60_000;
    xhr.onload = () => {
      let json: { success?: boolean; message?: string; data?: unknown } | null = null;
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        json = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && json?.success) resolve(json.data as T);
      else reject(new ApiError(xhr.status, json?.message ?? 'Something went wrong. Please try again.', (json as { data?: Record<string, unknown> } | null)?.data));
    };
    xhr.send(form);
  });
}

/** POSTs one file as multipart/form-data (field `file`), refreshing the sign-in once on a 401 like every other call. */
export async function apiUpload<T>(path: string, file: UploadFile): Promise<T> {
  try {
    return await sendFile<T>(path, file, getTokens()?.accessToken);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) throw err;
    if (!(await refreshTokens())) throw err;
    return sendFile<T>(path, file, getTokens()?.accessToken);
  }
}

export const apiGet = <T>(path: string, opts?: Options) =>
  request<T>('GET', path, undefined, { auth: true, ...opts });
export const apiPut = <T>(path: string, body: unknown, opts?: Options) =>
  request<T>('PUT', path, body, { auth: true, ...opts });
export const apiPost = <T>(path: string, body: unknown, opts?: Options) =>
  request<T>('POST', path, body, opts);
export const apiPatch = <T>(path: string, body: unknown, opts?: Options) =>
  request<T>('PATCH', path, body, { auth: true, ...opts });
export const apiDelete = <T>(path: string, opts?: Options, body?: unknown) => request<T>('DELETE', path, body, { auth: true, ...opts });
