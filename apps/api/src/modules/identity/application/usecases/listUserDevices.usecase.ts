import { AppError } from '@/shared/errors/AppError.js';
import type { UserDevice } from '../../domain/userDevice.entity.js';
import type { UserDeviceRepositoryPort } from '../../domain/userDevice.repository.port.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import type { UserSessionRepositoryPort } from '../../domain/userSession.repository.port.js';

export interface UserDeviceView extends UserDevice {
  loggedIn: boolean;
  lastActiveAt: Date | null;
}

/** One employee's devices, every status, newest first — the Admin device screen. */
export class ListUserDevicesUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly userDeviceRepository: UserDeviceRepositoryPort,
    private readonly userSessionRepository: UserSessionRepositoryPort,
  ) {}

  async execute(userId: string): Promise<UserDeviceView[]> {
    if (!(await this.userRepository.findById(userId))) throw AppError.notFound();

    const [devices, sessions] = await Promise.all([
      this.userDeviceRepository.listForUser(userId),
      this.userSessionRepository.findActiveForUser(userId),
    ]);
    // Sessions come back most-recently-active first, so the first one per device wins.
    const lastActiveByDevice = new Map<string, Date>();
    for (const session of sessions) {
      if (!lastActiveByDevice.has(session.deviceId)) lastActiveByDevice.set(session.deviceId, session.lastActiveAt);
    }

    return devices.map((device) => {
      const live = device.status === 'REGISTERED' ? lastActiveByDevice.get(device.deviceId) : undefined;
      return { ...device, loggedIn: live !== undefined, lastActiveAt: live ?? null };
    });
  }
}
