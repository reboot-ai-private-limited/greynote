import type { CtcAssignment } from '../../domain/ctcAssignment.entity.js';
import type { CtcAssignmentRepositoryPort } from '../../domain/ctcAssignment.repository.port.js';

/** The revision in force for a payroll month, or `null` when the employee has none yet — what Payroll reads. */
export class GetCtcForMonthUseCase {
  constructor(private readonly assignments: CtcAssignmentRepositoryPort) {}

  execute(userId: string, month: string): Promise<CtcAssignment | null> {
    return this.assignments.findEffective(userId, month);
  }
}
