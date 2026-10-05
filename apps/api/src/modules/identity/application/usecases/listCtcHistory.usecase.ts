import type { CtcAssignment } from '../../domain/ctcAssignment.entity.js';
import type { CtcAssignmentRepositoryPort } from '../../domain/ctcAssignment.repository.port.js';

export class ListCtcHistoryUseCase {
  constructor(private readonly assignments: CtcAssignmentRepositoryPort) {}

  execute(userId: string): Promise<CtcAssignment[]> {
    return this.assignments.listByUser(userId);
  }
}
