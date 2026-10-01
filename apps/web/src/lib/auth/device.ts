import type { LoginRequestDto } from '@greynote/contracts';

const STORAGE_KEY = 'gn.deviceId';

/**
 * The API's login requires a device identity. ADMIN / HR / ACCOUNTANT have no device registry, so
 * this is only a stable label for the session row: a random id kept in localStorage, falling
 * back to a fresh one when storage is unavailable.
 */
function deviceId(): string {
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

export function getDeviceIdentity(): Pick<
  LoginRequestDto,
  'deviceId' | 'deviceName' | 'deviceModel' | 'platform'
> {
  return {
    deviceId: deviceId(),
    deviceName: 'Web portal',
    deviceModel: typeof navigator === 'undefined' ? 'browser' : navigator.userAgent.slice(0, 80),
    platform: 'WEB',
  };
}
