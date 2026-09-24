import type { TransactionRunnerPort } from '../../domain/transactionRunner.port.js';
import type { UserDeviceRepositoryPort } from '../../domain/userDevice.repository.port.js';
import type { UserSessionRepositoryPort } from '../../domain/userSession.repository.port.js';
import { loadOwnedDevice } from './ownedDevice.js';

/** Unregisters a phone and ends its sessions together — this is what frees a device slot. */
export class RemoveDeviceUseCase {
  constructor(
    private readonly userDeviceRepository: UserDeviceRepositoryPort,
    private readonly userSessionRepository: UserSessionRepositoryPort,
    private readonly transactionRunner: TransactionRunnerPort,
  ) {}

  async execute(adminId: string, userId: string, deviceRowId: string): Promise<void> {
    const device = await loadOwnedDevice(this.userDeviceRepository, userId, deviceRowId, 'REGISTERED');
    await this.transactionRunner.run(async (ctx) => {
      await this.userDeviceRepository.setStatus(device.id, { status: 'REMOVED', decidedBy: adminId }, ctx);
      await this.userSessionRepository.revokeActiveForDevice(userId, device.deviceId, 'ADMIN', ctx);
    });
  }
}
