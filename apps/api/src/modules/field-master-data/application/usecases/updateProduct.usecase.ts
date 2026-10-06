import { AppError } from '@/shared/errors/AppError.js';
import { skuTaken } from '../skuTaken.js';
import { priceLadderProblem, type Product } from '../../domain/product.entity.js';
import type { ProductRepositoryPort } from '../../domain/product.repository.port.js';

export class UpdateProductUseCase {
  constructor(private readonly products: ProductRepositoryPort) {}

  async execute(id: string, change: Partial<Omit<Product, 'id'>>): Promise<Product> {
    const current = await this.products.findById(id);
    if (!current) throw AppError.notFound('No such product.');
    // The ladder is checked on the prices as they will stand, so changing only the MRP is still compared with the stored PTR and PTS.
    const problem = priceLadderProblem({
      ptsPaise: change.ptsPaise ?? current.ptsPaise,
      ptrPaise: change.ptrPaise ?? current.ptrPaise,
      mrpPaise: change.mrpPaise ?? current.mrpPaise,
    });
    if (problem) throw AppError.badRequest(problem.message, { field: problem.field });
    const updated = await this.products.update(id, change);
    if (!updated) throw skuTaken();
    return updated;
  }
}
