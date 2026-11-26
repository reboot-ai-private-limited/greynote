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
    private readonly hqs: HqRepositoryPort,
  ) {}

  /**
   * Where the employee is based: since 2026-11-26 every designation has exactly one HQ, so this is their main HQ and its Zone. An older
   * multi-HQ / Zone coverage is no longer read (it stays stored as history).
   */
  async execute(userId: string): Promise<Pick<ManagerCoverage, 'userId' | 'hqIds' | 'zoneIds'>> {
    const active = await this.userHqs.findActive(userId);
    const hq = active ? await this.hqs.findById(active.hqId) : null;
    return { userId, hqIds: active ? [active.hqId] : [], zoneIds: hq ? [hq.zoneId] : [] };
  }
}

/**
 * Admin/HR set where an employee is based: exactly one HQ, for every designation (decision-log 2026-11-26). It becomes their main HQ, and
 * the stored coverage is replaced by that HQ and its Zone, so nothing old lingers. Zones alone are refused.
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
    if (hqIds.length !== 1) throw AppError.badRequest('Choose one HQ: every employee is based in exactly one.', { field: 'hqIds' });
    const foundHqs = await this.hqs.findByIds(hqIds);
    if (foundHqs.length !== hqIds.length || foundHqs.some((h) => h.status !== 'active')) throw AppError.badRequest('Every HQ must exist and be active.', { field: 'hqIds' });
    // The Zone of every HQ covered is stored too, so the list and filters need not work it out from the HQs.
    const zoneIds = [...new Set(foundHqs.map((h) => h.zoneId))];
    for (const zoneId of zoneIds) {
      const zone = await this.zones.findById(zoneId);
      if (!zone || zone.status !== 'active') throw AppError.badRequest('Every Zone must exist and be active.', { field: 'zoneIds' });
    }
    const saved = await this.coverage.save({ userId, hqIds, zoneIds, updatedBy: actorId });
    const current = await this.userHqs.findActive(userId);
    if (!current || current.hqId !== hqIds[0]) await this.setMainHq.execute(userId, hqIds[0] as string, actorId);
    return saved;
  }
}
