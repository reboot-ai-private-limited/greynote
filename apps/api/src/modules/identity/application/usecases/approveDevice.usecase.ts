import { AppError } from '@/shared/errors/AppError.js';
import type { ConfigProviderPort } from '../../domain/configProvider.port.js';
import type { UserDevice } from '../../domain/userDevice.entity.js';
import type { UserDeviceRepositoryPort } from '../../domain/userDevice.repository.port.js';
import { loadOwnedDevice } from './ownedDevice.js';

export class ApproveDeviceUseCase {
  constructor(
    private readonly userDeviceRepository: UserDeviceRepositoryPort,
    private readonly configProvider: ConfigProviderPort,
  ) {}

  async execute(adminId: string, userId: string, deviceRowId: string): Promise<UserDevice> {
    const device = await loadOwnedDevice(this.userDeviceRepository, userId, deviceRowId, 'PENDING');

    // Pending requests already count toward the limit, so this only trips if Admin lowered the
    // setting after the request was made.
    const limit = Number(await this.configProvider.get('MAX_REGISTERED_DEVICES_FIELD'));
    if ((await this.userDeviceRepository.countRegistered(userId)) >= limit) {
      throw AppError.conflict(`This employee already has ${limit} registered devices. Remove one first.`, {
        limit,
      });
    }

    return this.userDeviceRepository.setStatus(device.id, { status: 'REGISTERED', decidedBy: adminId });
  }
}
