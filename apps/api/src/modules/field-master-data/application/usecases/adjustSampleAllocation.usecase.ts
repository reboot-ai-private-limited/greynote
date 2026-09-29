import { AppError } from '@/shared/errors/AppError.js';
import type { SampleAllocation } from '../../domain/sampleAllocation.entity.js';
import type { SampleAllocationRepositoryPort } from '../../domain/sampleAllocation.repository.port.js';

/** Admin corrects the allocated total — never below what has already been given out. */
export class AdjustSampleAllocationUseCase {
  constructor(private readonly allocations: SampleAllocationRepositoryPort) {}

  async execute(input: { doctorId: string; productId: string; total: number; adminId: string }): Promise<SampleAllocation> {
    const existing = await this.allocations.find(input.doctorId, input.productId);
    if (!existing) throw AppError.notFound('No samples have been issued for this doctor and product.');
    const updated = await this.allocations.setAllocated({ ...input, by: input.adminId });
    if (!updated) {
      const given = existing.quantityAllocated - existing.quantityRemaining;
      throw AppError.conflict(`${given} have already been given out, so the total can’t be less than that.`, { field: 'quantityAllocated', given });
    }
    return updated;
  }
}
