import { AppError } from '@/shared/errors/AppError.js';
import type { DeviceStatus, UserDevice } from '../../domain/userDevice.entity.js';
import type { UserDeviceRepositoryPort } from '../../domain/userDevice.repository.port.js';

/**
 * Loads a device row for an Admin action on `/users/:userId/devices/:deviceRowId`. A row that
 * belongs to a different user is a 404, not a 403 — the URL simply names nothing that exists.
 */
export async function loadOwnedDevice(
  repository: UserDeviceRepositoryPort,
  userId: string,
  deviceRowId: string,
  expectedStatus: DeviceStatus,
): Promise<UserDevice> {
  const device = await repository.findById(deviceRowId);
  if (!device || device.userId !== userId) throw AppError.notFound('Device not found.');
  if (device.status !== expectedStatus) {
    throw AppError.conflict(`This device is ${device.status.toLowerCase()}, not ${expectedStatus.toLowerCase()}.`, {
      status: device.status,
    });
  }
  return device;
}
