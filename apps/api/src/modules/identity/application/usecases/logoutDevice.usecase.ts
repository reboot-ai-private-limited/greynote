import type { UserDeviceRepositoryPort } from '../../domain/userDevice.repository.port.js';
import type { UserSessionRepositoryPort } from '../../domain/userSession.repository.port.js';
import { loadOwnedDevice } from './ownedDevice.js';

/** Ends a registered phone's sessions but keeps it registered — the employee can log straight back in. */
export class LogoutDeviceUseCase {
  constructor(
    private readonly userDeviceRepository: UserDeviceRepositoryPort,
    private readonly userSessionRepository: UserSessionRepositoryPort,
  ) {}

  async execute(userId: string, deviceRowId: string): Promise<void> {
    const device = await loadOwnedDevice(this.userDeviceRepository, userId, deviceRowId, 'REGISTERED');
    await this.userSessionRepository.revokeActiveForDevice(userId, device.deviceId, 'ADMIN');
  }
}
