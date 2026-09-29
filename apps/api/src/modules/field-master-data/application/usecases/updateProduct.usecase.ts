import { AppError } from '@/shared/errors/AppError.js';
import { skuTaken } from '../skuTaken.js';
import type { Product } from '../../domain/product.entity.js';
import type { ProductRepositoryPort } from '../../domain/product.repository.port.js';

export class UpdateProductUseCase {
  constructor(private readonly products: ProductRepositoryPort) {}

  async execute(id: string, change: Partial<Omit<Product, 'id'>>): Promise<Product> {
    if (!(await this.products.findById(id))) throw AppError.notFound('No such product.');
    const updated = await this.products.update(id, change);
    if (!updated) throw skuTaken();
    return updated;
  }
}
