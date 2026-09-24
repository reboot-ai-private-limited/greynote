import type { UserDevice } from '../../domain/userDevice.entity.js';
import type { UserDeviceRepositoryPort } from '../../domain/userDevice.repository.port.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';

export interface PendingDeviceRequest extends UserDevice {
  employeeCode: string | null;
  employeeName: string | null;
}

/** Org-wide Admin approval queue, oldest request first. */
export class ListPendingDevicesUseCase {
  constructor(
    private readonly userDeviceRepository: UserDeviceRepositoryPort,
    private readonly userRepository: UserRepositoryPort,
  ) {}

  async execute(): Promise<PendingDeviceRequest[]> {
    const pending = await this.userDeviceRepository.listPending();
    const userIds = [...new Set(pending.map((d) => d.userId))];
    const users = new Map(
      (await Promise.all(userIds.map((id) => this.userRepository.findById(id))))
        .filter((u) => u !== null)
        .map((u) => [u.id, u]),
    );
    return pending.map((device) => ({
      ...device,
      employeeCode: users.get(device.userId)?.employeeCode ?? null,
      employeeName: users.get(device.userId)?.name ?? null,
    }));
  }
}
