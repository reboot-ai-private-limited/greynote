import { Schema, model } from 'mongoose';
import { MASTER_STATUSES, type MasterStatus } from '../domain/masterStatus.js';

export interface ProductDoc {
  name: string;
  sku: string;
  /** Lower-cased, trimmed SKU — unique, so "ab-1" and "AB-1" can't both exist. */
  skuKey: string;
  category: string;
  status: MasterStatus;
}

const productSchema = new Schema<ProductDoc>({
  name: { type: String, required: true },
  sku: { type: String, required: true },
  skuKey: { type: String, required: true, unique: true },
  category: { type: String, required: true },
  status: { type: String, required: true, enum: MASTER_STATUSES },
});
productSchema.index({ category: 1, status: 1 });

export const ProductModel = model<ProductDoc>('Product', productSchema);
