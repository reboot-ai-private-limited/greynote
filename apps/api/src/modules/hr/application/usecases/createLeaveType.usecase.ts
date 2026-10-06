import { AppError } from '@/shared/errors/AppError.js';
import type { LeaveType } from '../../domain/leaveType.entity.js';
import type { LeaveTypeRepositoryPort } from '../../domain/leaveType.repository.port.js';

export class CreateLeaveTypeUseCase {
  constructor(private readonly types: LeaveTypeRepositoryPort) {}

  async execute(input: { name: string; isPaid: boolean; allowsProof?: boolean | undefined }): Promise<LeaveType> {
    const created = await this.types.create({ name: input.name, isPaid: input.isPaid, allowsProof: input.allowsProof ?? false, active: true });
    if (!created) throw AppError.conflict('A leave type with this name already exists.', { field: 'name' });
    return created;
  }
}
