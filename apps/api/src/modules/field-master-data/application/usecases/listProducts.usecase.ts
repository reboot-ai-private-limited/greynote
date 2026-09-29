import type { PaginatedResult } from '@/shared/http/pagination.js';
import type { Product } from '../../domain/product.entity.js';
import type { ProductFilter, ProductRepositoryPort } from '../../domain/product.repository.port.js';

export class ListProductsUseCase {
  constructor(private readonly products: ProductRepositoryPort) {}

  execute(filter: ProductFilter): Promise<PaginatedResult<Product>> {
    return this.products.list(filter);
  }
}
