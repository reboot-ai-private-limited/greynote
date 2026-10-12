import type { EmployeeProfileRepositoryPort } from '../../domain/employeeProfile.repository.port.js';

export interface EmploymentDetails {
  payBandId: string | null;
  dateOfJoining: Date | null;
  onProbation: boolean;
  /** Null: the `PROBATION_MONTHS` setting applies. */
  probationMonths: number | null;
  /** The ESI number (17 digits), or null. */
  esiNumber: string | null;
}

/**
 * A FIELD employee's Pay Band and joining date — what HR seeds leave balances from. `null` when
 * the user has no `EmployeeProfile` (every non-FIELD role, or an unknown id).
 */
export class GetEmploymentDetailsUseCase {
  constructor(private readonly employeeProfileRepository: EmployeeProfileRepositoryPort) {}

  async execute(userId: string): Promise<EmploymentDetails | null> {
    const profile = await this.employeeProfileRepository.findByUserId(userId);
    return profile && { payBandId: profile.payBandId, dateOfJoining: profile.dateOfJoining, onProbation: profile.onProbation, probationMonths: profile.probationMonths, esiNumber: profile.esiNumber };
  }
}
