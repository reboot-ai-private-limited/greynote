import type { DeviceBlockReason, LoginResponse, SessionUser } from '@/types/auth';

import { ApiError, apiGet, apiPost, NetworkError } from './api';
import { getDeviceInfo } from './device';
import { isOnline } from '@/offline/connectivity';
import { backupDrafts, prepareForUser, resetOfflineData } from '@/offline/engine';

import { clearSession, getTokens, setSession, setUser } from './session';

export type LoginResult =
  | { ok: true }
  | { ok: false; kind: 'device'; reason: DeviceBlockReason; retryAfter?: string; limit?: number }
  | { ok: false; kind: 'error'; message: string };

const DEVICE_REASONS: DeviceBlockReason[] = [
  'DEVICE_APPROVAL_PENDING',
  'DEVICE_REJECTED',
  'DEVICE_LIMIT_REACHED',
];

/** POST /api/identity/auth/login — see hld/04 §2 for the device-approval responses. */
export async function login(employeeCode: string, password: string): Promise<LoginResult> {
  try {
    const device = await getDeviceInfo();
    const data = await apiPost<LoginResponse>('/identity/auth/login', {
      employeeCode,
      password,
      ...device,
    });
    await setSession(data);
    await prepareForUser(data.user.id);
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) {
      const reason = err.data?.reason as DeviceBlockReason | undefined;
      if (reason && DEVICE_REASONS.includes(reason)) {
        return {
          ok: false,
          kind: 'device',
          reason,
          retryAfter: err.data?.retryAfter as string | undefined,
          limit: err.data?.limit as number | undefined,
        };
      }
      return { ok: false, kind: 'error', message: err.message };
    }
    if (err instanceof NetworkError) return { ok: false, kind: 'error', message: err.message };
    return { ok: false, kind: 'error', message: 'Something went wrong. Please try again.' };
  }
}

/** GET /identity/auth/me — refreshes the saved user, rotating the token first if it expired. */
export async function loadCurrentUser(): Promise<SessionUser> {
  const user = await apiGet<SessionUser>('/identity/auth/me');
  await setUser(user);
  return user;
}

/**
 * Changes the signed-in employee's password (docs/mobile/account.md). The current `refreshToken` goes along so this phone stays
 * signed in while every other session of the employee is signed out. Online only. Errors carry the server's message
 * (`403` wrong current password, `400` too short or same as before, `429` too many wrong tries).
 */
export const changePassword = (currentPassword: string, newPassword: string) =>
  apiPost<unknown>('/identity/auth/change-password', { currentPassword, newPassword, refreshToken: getTokens()?.refreshToken }, { auth: true });

/**
 * Revokes this phone's session on the server (best effort), then forgets it locally. Unsent
 * records are backed up first and then wiped from the phone — they come back at the next login
 * (offline/engine.ts restoreDrafts). A session that merely *expires* keeps them: only an explicit
 * logout, or a different employee logging in, clears the phone.
 */
export async function logout(): Promise<void> {
  if (isOnline()) {
    try {
      await backupDrafts();
    } catch {
      // Best effort — the confirm dialog on Profile already warned about unsent records.
    }
  }
  const refreshToken = getTokens()?.refreshToken;
  try {
    if (refreshToken) await apiPost('/identity/auth/logout', { refreshToken }, { auth: true });
  } catch {
    // Offline or already expired — signing out locally must still work.
  }
  await clearSession();
  await resetOfflineData();
}
