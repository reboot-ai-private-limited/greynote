import { AppError } from '@/shared/errors/AppError.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { ManagerCoverage } from '../../domain/managerCoverage.entity.js';
import type { ManagerCoverageRepositoryPort } from '../../domain/managerCoverage.repository.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { UserHqAssignmentRepositoryPort } from '../../domain/userHqAssignment.repository.port.js';
import type { SetUserHqUseCase } from './setUserHq.usecase.js';
import type { ZoneRepositoryPort } from '../../domain/zone.repository.port.js';

export class GetManagerCoverageUseCase {
  constructor(
    private readonly coverage: ManagerCoverageRepositoryPort,
    private readonly userHqs: UserHqAssignmentRepositoryPort,
  ) {}

  /**
   * What the employee covers. Nobody recorded a coverage for an employee set up before coverage was for everyone, so their single HQ is
   * read as the HQ they cover (the same answer a one-off copy would give, without running one).
   */
  async execute(userId: string): Promise<Pick<ManagerCoverage, 'userId' | 'hqIds' | 'zoneIds'>> {
    const found = await this.coverage.find(userId);
    if (found && (found.hqIds.length > 0 || found.zoneIds.length > 0)) return { userId, hqIds: found.hqIds, zoneIds: found.zoneIds };
    const active = await this.userHqs.findActive(userId);
    return { userId, hqIds: active ? [active.hqId] : [], zoneIds: [] };
  }
}

/**
 * Admin/HR set the Zones and HQs an employee covers (any field employee: an MR's HQs, an ASM's or RSM's HQs, a ZSM's or NSM's Zones); it
 * replaces the previous list whole. The first HQ becomes the employee's main HQ when the current one is not among them, so everything that
 * still reads one HQ (the employee list, the manager picker) keeps working.
 */
export class SetManagerCoverageUseCase {
  constructor(
    private readonly coverage: ManagerCoverageRepositoryPort,
    private readonly hqs: HqRepositoryPort,
    private readonly zones: ZoneRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly userHqs: UserHqAssignmentRepositoryPort,
    private readonly setMainHq: SetUserHqUseCase,
  ) {}

  async execute(userId: string, input: { hqIds: string[]; zoneIds: string[] }, actorId: string): Promise<ManagerCoverage> {
    const user = await this.users.findUserSummary(userId);
    if (!user) throw AppError.notFound('No such employee.');
    if (user.role !== 'FIELD') throw AppError.badRequest('Only field employees have a coverage.', { field: 'userId' });
    if (user.status === 'inactive') throw AppError.conflict('That employee is inactive.', { field: 'userId' });

    const hqIds = [...new Set(input.hqIds)];
    const zoneIds = [...new Set(input.zoneIds)];
    const foundHqs = await this.hqs.findByIds(hqIds);
    if (foundHqs.length !== hqIds.length || foundHqs.some((h) => h.status !== 'active')) throw AppError.badRequest('Every HQ must exist and be active.', { field: 'hqIds' });
    for (const zoneId of zoneIds) {
      const zone = await this.zones.findById(zoneId);
      if (!zone || zone.status !== 'active') throw AppError.badRequest('Every Zone must exist and be active.', { field: 'zoneIds' });
    }
    const saved = await this.coverage.save({ userId, hqIds, zoneIds, updatedBy: actorId });
    const current = await this.userHqs.findActive(userId);
    if (hqIds.length > 0 && (!current || !hqIds.includes(current.hqId))) await this.setMainHq.execute(userId, hqIds[0] as string, actorId);
    return saved;
  }
}
