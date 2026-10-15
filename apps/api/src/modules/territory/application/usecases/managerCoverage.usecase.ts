import { AppError } from '@/shared/errors/AppError.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { ManagerCoverage } from '../../domain/managerCoverage.entity.js';
import type { ManagerCoverageRepositoryPort } from '../../domain/managerCoverage.repository.port.js';
import type { ManagerDirectoryPort } from '../../domain/managerDirectory.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { ZoneRepositoryPort } from '../../domain/zone.repository.port.js';

/** ASM is level 2: coverage belongs to managers, never to an MR. */
const MIN_MANAGER_LEVEL = 2;

export class GetManagerCoverageUseCase {
  constructor(private readonly coverage: ManagerCoverageRepositoryPort) {}

  async execute(userId: string): Promise<Pick<ManagerCoverage, 'userId' | 'hqIds' | 'zoneIds'>> {
    const found = await this.coverage.find(userId);
    return { userId, hqIds: found?.hqIds ?? [], zoneIds: found?.zoneIds ?? [] };
  }
}

/** Admin/HR set the HQs (ASM, RSM) or Zones (ZSM) a manager covers; it replaces the previous list whole. */
export class SetManagerCoverageUseCase {
  constructor(
    private readonly coverage: ManagerCoverageRepositoryPort,
    private readonly hqs: HqRepositoryPort,
    private readonly zones: ZoneRepositoryPort,
    private readonly users: UserDirectoryPort & ManagerDirectoryPort,
  ) {}

  async execute(userId: string, input: { hqIds: string[]; zoneIds: string[] }, actorId: string): Promise<ManagerCoverage> {
    const user = await this.users.findUserSummary(userId);
    if (!user) throw AppError.notFound('No such employee.');
    if (user.role !== 'FIELD') throw AppError.badRequest('Only field employees have a coverage.', { field: 'userId' });
    if (user.status === 'inactive') throw AppError.conflict('That employee is inactive.', { field: 'userId' });
    const level = (await this.users.getDesignationLevels([userId]))[0]?.level ?? 0;
    if (level < MIN_MANAGER_LEVEL) throw AppError.badRequest('Only a manager (ASM or above) has a coverage.', { field: 'userId' });

    const hqIds = [...new Set(input.hqIds)];
    const zoneIds = [...new Set(input.zoneIds)];
    const foundHqs = await this.hqs.findByIds(hqIds);
    if (foundHqs.length !== hqIds.length || foundHqs.some((h) => h.status !== 'active')) throw AppError.badRequest('Every HQ must exist and be active.', { field: 'hqIds' });
    for (const zoneId of zoneIds) {
      const zone = await this.zones.findById(zoneId);
      if (!zone || zone.status !== 'active') throw AppError.badRequest('Every Zone must exist and be active.', { field: 'zoneIds' });
    }
    return this.coverage.save({ userId, hqIds, zoneIds, updatedBy: actorId });
  }
}
