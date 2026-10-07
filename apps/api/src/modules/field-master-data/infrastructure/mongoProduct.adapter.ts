import { Types } from 'mongoose';
import { buildPaginatedResult, toSkipLimit, type PaginatedResult } from '@/shared/http/pagination.js';
import type { Product } from '../domain/product.entity.js';
import type { ProductFilter, ProductRepositoryPort } from '../domain/product.repository.port.js';
import { escapeRegex, isDuplicateKey, toSkuKey } from './mongoHelpers.js';
import { ProductModel, type ProductDoc } from './product.schema.js';

const toProduct = (doc: ProductDoc & { _id: unknown }): Product => ({
  id: String(doc._id),
  name: doc.name,
  sku: doc.sku,
  category: doc.category,
  composition: doc.composition ?? null,
  type: doc.type ?? null,
  packSize: doc.packSize ?? null,
  ptsPaise: doc.ptsPaise ?? null,
  ptrPaise: doc.ptrPaise ?? null,
  mrpPaise: doc.mrpPaise ?? null,
  gstPercent: doc.gstPercent ?? null,
  division: doc.division ?? null,
  status: doc.status,
});

export class MongoProductAdapter implements ProductRepositoryPort {
  async list(filter: ProductFilter): Promise<PaginatedResult<Product>> {
    const query: Record<string, unknown> = {};
    if (filter.category) query['category'] = filter.category;
    if (filter.status) query['status'] = filter.status;
    if (filter.search) {
      const rx = new RegExp(escapeRegex(filter.search), 'i');
      query['$or'] = [{ name: rx }, { sku: rx }, { composition: rx }];
    }
    const [docs, total] = await Promise.all([
      ProductModel.find(query).sort({ name: 1, _id: 1 }).skip(toSkipLimit(filter).skip).limit(filter.pageSize).lean(),
      ProductModel.countDocuments(query),
    ]);
    return buildPaginatedResult(docs.map(toProduct), total, filter);
  }

  async listActive(): Promise<Product[]> {
    return (await ProductModel.find({ status: 'active' }).sort({ name: 1, _id: 1 }).lean()).map(toProduct);
  }

  async findByIds(ids: string[]): Promise<Product[]> {
    const valid = [...new Set(ids)].filter((id) => Types.ObjectId.isValid(id));
    if (valid.length === 0) return [];
    return (await ProductModel.find({ _id: { $in: valid.map((id) => new Types.ObjectId(id)) } }).lean()).map(toProduct);
  }

  async findById(id: string): Promise<Product | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await ProductModel.findById(id).lean();
    return doc ? toProduct(doc) : null;
  }

  async create(input: Omit<Product, 'id'>): Promise<Product | null> {
    try {
      const doc = await ProductModel.create({ ...input, skuKey: toSkuKey(input.sku) });
      return toProduct(doc.toObject());
    } catch (err) {
      if (isDuplicateKey(err)) return null;
      throw err;
    }
  }

  async update(id: string, change: Partial<Omit<Product, 'id'>>): Promise<Product | null> {
    try {
      const doc = await ProductModel.findByIdAndUpdate(
        id,
        { ...change, ...(change.sku !== undefined && { skuKey: toSkuKey(change.sku) }) },
        { new: true },
      ).lean();
      return doc ? toProduct(doc) : null;
    } catch (err) {
      if (isDuplicateKey(err)) return null;
      throw err;
    }
  }
}
