import { AppError } from '@/shared/errors/AppError.js';
import type { DoctorRepositoryPort } from '../../domain/doctor.repository.port.js';
import type { ProductRepositoryPort } from '../../domain/product.repository.port.js';
import type { SampleAllocation } from '../../domain/sampleAllocation.entity.js';
import type { SampleAllocationRepositoryPort } from '../../domain/sampleAllocation.repository.port.js';
import type { Actor } from '../actor.js';
import type { DoctorVisibility } from '../doctorVisibility.js';

export type SampleAllocationView = SampleAllocation & { productName: string; productSku: string };

/** What samples a Doctor has and how many are left — Admin, the assigned MR, or their manager (a 404 to anyone else). */
export class ListSampleAllocationsUseCase {
  constructor(
    private readonly allocations: SampleAllocationRepositoryPort,
    private readonly doctors: DoctorRepositoryPort,
    private readonly products: ProductRepositoryPort,
    private readonly visibility: DoctorVisibility,
  ) {}

  async execute(actor: Actor, doctorId: string): Promise<SampleAllocationView[]> {
    const doctor = await this.doctors.findById(doctorId);
    if (!doctor || !(await this.visibility.canView(actor, doctor))) throw AppError.notFound('No such doctor.');
    const rows = await this.allocations.listForDoctor(doctorId);
    return Promise.all(
      rows.map(async (a) => {
        const product = await this.products.findById(a.productId);
        return { ...a, productName: product?.name ?? '', productSku: product?.sku ?? '' };
      }),
    );
  }
}
