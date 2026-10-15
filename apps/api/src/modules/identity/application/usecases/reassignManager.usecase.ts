import { AppError } from '@/shared/errors/AppError.js';
import type { DesignationRepositoryPort } from '../../domain/designation.repository.port.js';
import type { EmployeeProfileRepositoryPort } from '../../domain/employeeProfile.repository.port.js';
import type { ManagerHistoryRepositoryPort } from '../../domain/managerHistory.repository.port.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import { ManagerRules } from './managerRules.js';

export const MAX_BULK_REASSIGN = 100;

export interface ReassignManagerResult {
  moved: Array<{ userId: string; name: string; fromManagerId: string | null }>;
  /** Already under that manager: left alone. */
  unchanged: Array<{ userId: string; name: string }>;
}

/**
 * Moves several employees under one new manager at once. Every person is checked first with the same rules as a single edit
 * (manager exists, higher designation, no reporting loop); if anyone fails, nothing is changed and every problem is returned.
 * Each move is dated history for the month it is made in.
 */
export class ReassignManagerUseCase {
  private readonly rules: ManagerRules;

  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly employeeProfileRepository: EmployeeProfileRepositoryPort,
    designationRepository: DesignationRepositoryPort,
    private readonly managerHistory: ManagerHistoryRepositoryPort,
    private readonly currentMonth: () => Promise<string>,
  ) {
    this.rules = new ManagerRules(employeeProfileRepository, designationRepository);
  }

  async execute(actorId: string, input: { userIds: string[]; managerId: string }): Promise<ReassignManagerResult> {
    const userIds = [...new Set(input.userIds)];
    if (userIds.length === 0 || userIds.length > MAX_BULK_REASSIGN) {
      throw AppError.badRequest(`Choose between 1 and ${MAX_BULK_REASSIGN} people.`, { field: 'userIds' });
    }
    const manager = await this.userRepository.findById(input.managerId);
    if (!manager) throw AppError.badRequest('Unknown manager.', { field: 'managerId' });

    const users = new Map((await this.userRepository.findByIds(userIds)).map((u) => [u.id, u]));
    const profiles = new Map((await this.employeeProfileRepository.findByUserIds(userIds)).map((p) => [p.userId, p]));

    const problems: Array<{ userId: string; name: string; message: string }> = [];
    const toMove: Array<{ userId: string; name: string; fromManagerId: string | null }> = [];
    const unchanged: Array<{ userId: string; name: string }> = [];

    for (const userId of userIds) {
      const user = users.get(userId);
      if (!user) {
        problems.push({ userId, name: 'Unknown employee', message: 'That employee does not exist.' });
        continue;
      }
      const from = profiles.get(userId)?.managerId ?? null;
      if (from === input.managerId) {
        unchanged.push({ userId, name: user.name });
        continue;
      }
      try {
        await this.rules.assertNoReportingLoop(userId, input.managerId);
        await this.rules.assertManagerIsHigher(userId, undefined, input.managerId);
        toMove.push({ userId, name: user.name, fromManagerId: from });
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        problems.push({ userId, name: user.name, message: error.message });
      }
    }

    if (problems.length > 0) {
      throw AppError.badRequest(problems[0]!.message, { field: 'managerId', problems });
    }

    const effectiveFrom = await this.currentMonth();
    for (const move of toMove) {
      await this.employeeProfileRepository.upsert(move.userId, { managerId: input.managerId });
      await this.managerHistory.record({
        userId: move.userId,
        managerId: input.managerId,
        previousManagerId: move.fromManagerId,
        effectiveFrom,
        source: 'BULK_REASSIGN',
        promotionId: null,
        createdBy: actorId,
      });
    }
    return { moved: toMove, unchanged };
  }
}
