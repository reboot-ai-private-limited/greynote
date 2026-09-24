import type { ConfigProviderPort } from '../../domain/configProvider.port.js';
import type { UserDevice } from '../../domain/userDevice.entity.js';
import type { UserDeviceRepositoryPort } from '../../domain/userDevice.repository.port.js';
import { loadOwnedDevice } from './ownedDevice.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The rejection expires after `REJECTED_DEVICE_TTL_DAYS`; a TTL index then deletes the row. */
export class RejectDeviceUseCase {
  constructor(
    private readonly userDeviceRepository: UserDeviceRepositoryPort,
    private readonly configProvider: ConfigProviderPort,
  ) {}

  async execute(adminId: string, userId: string, deviceRowId: string): Promise<UserDevice> {
    const device = await loadOwnedDevice(this.userDeviceRepository, userId, deviceRowId, 'PENDING');
    const ttlDays = Number(await this.configProvider.get('REJECTED_DEVICE_TTL_DAYS'));
    return this.userDeviceRepository.setStatus(device.id, {
      status: 'REJECTED',
      decidedBy: adminId,
      expiresAt: new Date(Date.now() + ttlDays * DAY_MS),
    });
  }
}
