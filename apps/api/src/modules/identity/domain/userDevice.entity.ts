import type { Platform } from './userSession.entity.js';

export const DEVICE_STATUSES = ['PENDING', 'REGISTERED', 'REJECTED', 'REMOVED'] as const;
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

/** Statuses that occupy the one live row a phone may have per employee. */
export const LIVE_DEVICE_STATUSES = ['PENDING', 'REGISTERED', 'REJECTED'] as const satisfies readonly DeviceStatus[];

/**
 * A phone a FIELD employee has asked to use (hld/04 §2). Every new phone starts `PENDING` and
 * needs Admin approval; logging out never frees a slot, only Admin removal does. `REJECTED` rows
 * carry `expiresAt` and are deleted by a TTL index once it passes. `REMOVED` rows are kept as
 * history.
 */
export interface UserDevice {
  id: string;
  userId: string;
  deviceId: string;
  deviceName: string;
  deviceModel: string;
  platform: Platform;
  status: DeviceStatus;
  requestedAt: Date;
  decidedAt: Date | null;
  decidedBy: string | null;
  expiresAt: Date | null;
}
