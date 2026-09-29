import { skuTaken } from '../skuTaken.js';
import type { Product } from '../../domain/product.entity.js';
import type { ProductRepositoryPort } from '../../domain/product.repository.port.js';

export class CreateProductUseCase {
  constructor(private readonly products: ProductRepositoryPort) {}

  async execute(input: Pick<Product, 'name' | 'sku' | 'category'>): Promise<Product> {
    const created = await this.products.create({ ...input, status: 'active' });
    if (!created) throw skuTaken();
    return created;
  }
}
