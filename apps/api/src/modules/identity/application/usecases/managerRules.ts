import { AppError } from '@/shared/errors/AppError.js';
import type { DesignationRepositoryPort } from '../../domain/designation.repository.port.js';
import type { EmployeeProfileRepositoryPort } from '../../domain/employeeProfile.repository.port.js';

/** Real chains are ~5 levels; this only bounds a walk through already-corrupted data. */
const MAX_CHAIN_DEPTH = 50;

/** What a manager may be: shared by the single edit (`UpdateUserUseCase`) and the bulk move (`ReassignManagerUseCase`). */
export class ManagerRules {
  constructor(
    private readonly employeeProfileRepository: EmployeeProfileRepositoryPort,
    private readonly designationRepository: DesignationRepositoryPort,
  ) {}

  /**
   * A manager must sit at a higher designation than the employee (levels may be skipped: an RSM can report to an NSM when there is no ZSM).
   * Only checked when both designations are known; an Admin or HR user used as a manager has none and is left alone.
   */
  async assertManagerIsHigher(employeeId: string, newDesignationId: string | undefined, managerId: string): Promise<void> {
    const employeeDesignationId = newDesignationId ?? (await this.employeeProfileRepository.findByUserId(employeeId))?.designationId ?? null;
    const managerDesignationId = (await this.employeeProfileRepository.findByUserId(managerId))?.designationId ?? null;
    if (!employeeDesignationId || !managerDesignationId) return;
    const [employee, manager] = await Promise.all([this.designationRepository.findById(employeeDesignationId), this.designationRepository.findById(managerDesignationId)]);
    if (employee && manager && manager.level <= employee.level) {
      throw AppError.badRequest(`A ${manager.name} cannot be the manager of a ${employee.name}: choose someone at a higher designation.`, { field: 'managerId' });
    }
  }

  /**
   * Walks upward from the proposed manager. Reaching the employee means they would report to
   * themselves; that includes the trivial case of choosing themselves. A loop that does not
   * involve the employee (bad data from before this check) ends the walk without an error.
   */
  async assertNoReportingLoop(employeeId: string, managerId: string): Promise<void> {
    const seen = new Set<string>();
    let current: string | null = managerId;
    for (let depth = 0; current !== null && depth < MAX_CHAIN_DEPTH; depth++) {
      if (current === employeeId) {
        throw AppError.badRequest(
          current === managerId
            ? 'An employee cannot report to themselves.'
            : 'That manager already reports to this employee, directly or through the chain.',
          { field: 'managerId' },
        );
      }
      if (seen.has(current)) return;
      seen.add(current);
      const profile = await this.employeeProfileRepository.findByUserId(current);
      current = profile?.managerId ?? null;
    }
  }
}
