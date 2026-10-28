import { AppError } from '@/shared/errors/AppError.js';
import { skuTaken } from '../skuTaken.js';
import { priceLadderProblem, type Product } from '../../domain/product.entity.js';
import type { ProductRepositoryPort } from '../../domain/product.repository.port.js';

export type CreateProductInput = Pick<Product, 'name' | 'sku' | 'category'> & {
  composition: string;
  type: NonNullable<Product['type']>;
  packSize: string;
  ptsPaise: number;
  ptrPaise: number;
  mrpPaise: number;
  gstPercent: NonNullable<Product['gstPercent']>;
  hsn: string;
  division?: string | undefined;
};

export class CreateProductUseCase {
  constructor(private readonly products: ProductRepositoryPort) {}

  async execute(input: CreateProductInput): Promise<Product> {
    const problem = priceLadderProblem(input);
    if (problem) throw AppError.badRequest(problem.message, { field: problem.field });
    const created = await this.products.create({ ...input, division: input.division ?? null, status: 'active' });
    if (!created) throw skuTaken();
    return created;
  }
}
