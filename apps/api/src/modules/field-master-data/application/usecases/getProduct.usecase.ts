import { AppError } from '@/shared/errors/AppError.js';
import type { Product } from '../../domain/product.entity.js';
import type { ProductRepositoryPort } from '../../domain/product.repository.port.js';

export class GetProductUseCase {
  constructor(private readonly products: ProductRepositoryPort) {}

  async execute(id: string): Promise<Product> {
    const product = await this.products.findById(id);
    if (!product) throw AppError.notFound('No such product.');
    return product;
  }
}
