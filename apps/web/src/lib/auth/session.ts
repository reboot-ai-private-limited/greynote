import { ApiError } from '../api/ApiError';
import { authApi } from '../api/endpoints/auth';
import { getDeviceIdentity } from './device';

/**
 * The web session.
 *
 * THE ACCESS TOKEN LIVES HERE, IN MEMORY, AND NOWHERE ELSE. The refresh token is an httpOnly
 * cookie page JavaScript cannot read; putting the access token somewhere an XSS can read would
 * give most of that back. A hard reload therefore has no token, which is why `restore()` exists.
 */

/** 80% of the default 15-minute access TTL. Refresh proactively, not on a 401. */
const REFRESH_AFTER_MS = 12 * 60 * 1000;

let accessToken: string | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * The in-flight refresh, shared by every caller. Refresh tokens ROTATE and presenting a spent
 * one revokes every session for the user — a screen with six queries each firing their own
 * refresh would sign the user out for doing nothing wrong. One promise, shared by all six.
 */
let inFlight: Promise<string> | null = null;

type Listener = (token: string | null) => void;
const listeners = new Set<Listener>();

function publish(token: string | null): void {
  accessToken = token;
  for (const listener of listeners) listener(token);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAccessToken(): string | null {
  return accessToken;
}

function scheduleRefresh(): void {
  if (refreshTimer !== null) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    // A background renewal: on failure `refresh` has already cleared the session.
    void refresh().catch(() => undefined);
  }, REFRESH_AFTER_MS);
}

function adopt(token: string): string {
  publish(token);
  scheduleRefresh();
  return token;
}

function clear(): void {
  if (refreshTimer !== null) clearTimeout(refreshTimer);
  refreshTimer = null;
  inFlight = null;
  publish(null);
}

/** Exchange the httpOnly cookie for a new access token. Single-flight. */
export function refresh(): Promise<string> {
  if (inFlight !== null) return inFlight;

  inFlight = authApi
    .refresh()
    .then((data) => adopt(data.accessToken))
    .catch((cause: unknown) => {
      clear();
      throw cause;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/**
 * Session restore on boot: a silent refresh using the cookie. Resolves `false` (not a throw) for
 * the ordinary not-signed-in case; a network failure re-throws so the shell can say the server is
 * unreachable instead of bouncing to a login form that will also fail.
 */
export async function restore(): Promise<boolean> {
  try {
    await refresh();
    return true;
  } catch (cause) {
    if (cause instanceof ApiError) return false;
    throw cause;
  }
}

export async function signIn(employeeCode: string, password: string): Promise<void> {
  const data = await authApi.login({ employeeCode, password, ...getDeviceIdentity() });
  adopt(data.accessToken);
}

export async function signOut(): Promise<void> {
  try {
    if (accessToken !== null) await authApi.logout(accessToken);
  } finally {
    // Cleared whether or not the server answered: logout is idempotent server-side.
    clear();
  }
}

/**
 * Run an authenticated request, refreshing once if the token has expired. The retry lives here,
 * not in the query layer, because a refresh must be shared across concurrent callers.
 */
export async function withAuth<T>(call: (token: string) => Promise<T>): Promise<T> {
  const token = accessToken ?? (await refresh());

  try {
    return await call(token);
  } catch (cause) {
    if (!(cause instanceof ApiError) || !cause.isAuthExpiry) throw cause;
    return call(await refresh());
  }
}
