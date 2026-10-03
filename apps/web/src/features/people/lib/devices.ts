import type { DeviceStatus, UserDeviceDto } from '@greynote/contracts';
import type { BadgeTone } from '@/components/ui/Badge';

/** What the Admin can do to a phone. `reject` and `approve` act on a pending one; `remove` and `logout` on a registered one. */
export type DeviceAction = 'approve' | 'reject' | 'remove' | 'logout';

export const STATUS_LABEL: Record<DeviceStatus, string> = {
  PENDING: 'Awaiting approval',
  REGISTERED: 'Registered',
  REJECTED: 'Rejected',
  REMOVED: 'Removed',
};

export const STATUS_TONE: Record<DeviceStatus, BadgeTone> = {
  PENDING: 'warning',
  REGISTERED: 'success',
  REJECTED: 'danger',
  REMOVED: 'neutral',
};

export const PLATFORM_LABEL: Record<UserDeviceDto['platform'], string> = {
  ANDROID: 'Android',
  IOS: 'iPhone',
  WEB: 'Web',
};

/** The actions the API will accept for a device in this state. Rejected and removed phones have none. */
export function actionsFor(device: Pick<UserDeviceDto, 'status' | 'loggedIn'>): DeviceAction[] {
  switch (device.status) {
    case 'PENDING':
      return ['approve', 'reject'];
    case 'REGISTERED':
      // Ending sessions on a phone nobody is signed in on does nothing, so it is not offered.
      return device.loggedIn ? ['logout', 'remove'] : ['remove'];
    default:
      return [];
  }
}

export const ACTION_LABEL: Record<DeviceAction, string> = {
  approve: 'Approve',
  reject: 'Reject',
  remove: 'Remove',
  logout: 'Log out',
};

export const ACTION_PAST: Record<DeviceAction, string> = {
  approve: 'Device approved.',
  reject: 'Device rejected.',
  remove: 'Device removed.',
  logout: 'Device logged out.',
};

/** What each action does, said before it is confirmed: these are the ones that are hard to take back. */
export function confirmCopy(action: DeviceAction, deviceName: string): { title: string; description: string; tone: 'danger' | 'primary' } {
  switch (action) {
    case 'approve':
      return { title: 'Approve device', description: `“${deviceName}” can sign in once approved. It uses one of the employee's device slots.`, tone: 'primary' };
    case 'reject':
      return { title: 'Reject device', description: `“${deviceName}” is blocked from asking again for a while, then counts as a new phone.`, tone: 'danger' };
    case 'remove':
      return { title: 'Remove device', description: `“${deviceName}” is signed out everywhere and unregistered, which frees a device slot. It needs approval again to come back.`, tone: 'danger' };
    case 'logout':
      return { title: 'Log out device', description: `“${deviceName}” is signed out now. It stays registered, so the employee can sign straight back in.`, tone: 'danger' };
  }
}

/** Registered plus pending phones: what counts against the employee's limit. */
export function slotsInUse(devices: readonly Pick<UserDeviceDto, 'status'>[]): number {
  return devices.filter((d) => d.status === 'PENDING' || d.status === 'REGISTERED').length;
}

/** Live phones first (pending, then registered), then history, each newest first. */
export function orderDevices<T extends Pick<UserDeviceDto, 'status' | 'requestedAt'>>(devices: readonly T[]): T[] {
  const rank: Record<DeviceStatus, number> = { PENDING: 0, REGISTERED: 1, REJECTED: 2, REMOVED: 3 };
  return [...devices].sort((a, b) => rank[a.status] - rank[b.status] || b.requestedAt.localeCompare(a.requestedAt));
}
