import type { DesignationRepositoryPort } from '../../domain/designation.repository.port.js';
import type { EmployeeProfileRepositoryPort } from '../../domain/employeeProfile.repository.port.js';

export interface EmploymentDetails {
  payBandId: string | null;
  dateOfJoining: Date | null;
  onProbation: boolean;
  /** Null: the `PROBATION_MONTHS` setting applies. */
  probationMonths: number | null;
  /** The ESI number (17 digits), or null. */
  esiNumber: string | null;
  /** The EPF member id, or null. */
  epfNumber: string | null;
  /** For the salary slip. */
  designationName: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
}

/**
 * A FIELD employee's Pay Band and joining date — what HR seeds leave balances from. `null` when
 * the user has no `EmployeeProfile` (every non-FIELD role, or an unknown id).
 */
export class GetEmploymentDetailsUseCase {
  constructor(
    private readonly employeeProfileRepository: EmployeeProfileRepositoryPort,
    private readonly designationRepository: DesignationRepositoryPort,
  ) {}

  async execute(userId: string): Promise<EmploymentDetails | null> {
    const profile = await this.employeeProfileRepository.findByUserId(userId);
    if (!profile) return null;
    const designation = profile.designationId ? await this.designationRepository.findById(profile.designationId) : null;
    return {
      payBandId: profile.payBandId,
      dateOfJoining: profile.dateOfJoining,
      onProbation: profile.onProbation,
      probationMonths: profile.probationMonths,
      esiNumber: profile.esiNumber,
      epfNumber: profile.epfNumber,
      designationName: designation?.name ?? null,
      bankName: profile.bankDetails?.bankName ?? null,
      bankAccountNumber: profile.bankDetails?.accountNumber ?? null,
    };
  }
}
