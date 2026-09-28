import type { LeaveType } from '../../domain/leaveType.entity.js';
import type { LeaveTypeRepositoryPort } from '../../domain/leaveType.repository.port.js';

export class ListLeaveTypesUseCase {
  constructor(private readonly types: LeaveTypeRepositoryPort) {}

  execute(): Promise<LeaveType[]> {
    return this.types.list();
  }
}
