import { AppError } from '@/shared/errors/AppError.js';
import type { DoctorRepositoryPort } from '../../domain/doctor.repository.port.js';
import type { ProductRepositoryPort } from '../../domain/product.repository.port.js';
import type { SampleAllocation } from '../../domain/sampleAllocation.entity.js';
import type { SampleAllocationRepositoryPort } from '../../domain/sampleAllocation.repository.port.js';

/**
 * Admin issues samples of a Product for a Doctor. One row per (Doctor, Product): issuing again adds
 * to it. The Doctor must be active (a `pending` one doesn't exist yet) and the Product active.
 */
export class IssueSampleAllocationUseCase {
  constructor(
    private readonly allocations: SampleAllocationRepositoryPort,
    private readonly doctors: DoctorRepositoryPort,
    private readonly products: ProductRepositoryPort,
  ) {}

  async execute(input: { doctorId: string; productId: string; quantity: number; adminId: string }): Promise<SampleAllocation> {
    const doctor = await this.doctors.findById(input.doctorId);
    if (!doctor) throw AppError.notFound('No such doctor.');
    if (doctor.status !== 'active') throw AppError.conflict('Samples can only be issued for an active doctor.');
    const product = await this.products.findById(input.productId);
    if (!product) throw AppError.badRequest('No such product.', { field: 'productId' });
    if (product.status !== 'active') throw AppError.conflict('This product is inactive.', { field: 'productId' });
    return this.allocations.issue({ doctorId: input.doctorId, productId: input.productId, quantity: input.quantity, by: input.adminId });
  }
}
