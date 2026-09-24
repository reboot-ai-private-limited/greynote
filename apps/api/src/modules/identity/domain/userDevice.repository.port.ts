import type { TransactionContext } from './transactionRunner.port.js';
import type { DeviceStatus, UserDevice } from './userDevice.entity.js';

export interface UserDeviceRepositoryPort {
  findById(id: string): Promise<UserDevice | null>;
  /** The PENDING / REGISTERED / REJECTED row for this phone, ignoring an expired rejection. */
  findLive(userId: string, deviceId: string): Promise<UserDevice | null>;
  /** PENDING + REGISTERED — what counts toward the device limit. */
  countSlotsUsed(userId: string): Promise<number>;
  countRegistered(userId: string): Promise<number>;
  createPending(input: Pick<UserDevice, 'userId' | 'deviceId' | 'deviceName' | 'deviceModel' | 'platform'>): Promise<UserDevice>;
  setStatus(
    id: string,
    change: { status: DeviceStatus; decidedBy: string; expiresAt?: Date | null },
    ctx?: TransactionContext,
  ): Promise<UserDevice>;
  listForUser(userId: string): Promise<UserDevice[]>;
  listPending(): Promise<UserDevice[]>;
}
