import { Schema, model } from 'mongoose';
import { GST_RATES, PRODUCT_TYPES, type GstRate, type ProductType } from '@greynote/contracts';
import { MASTER_STATUSES, type MasterStatus } from '../domain/masterStatus.js';

export interface ProductDoc {
  name: string;
  sku: string;
  /** Lower-cased, trimmed SKU — unique, so "ab-1" and "AB-1" can't both exist. */
  skuKey: string;
  category: string;
  composition?: string | null;
  type?: ProductType | null;
  packSize?: string | null;
  ptsPaise?: number | null;
  ptrPaise?: number | null;
  mrpPaise?: number | null;
  gstPercent?: GstRate | null;
  division?: string | null;
  status: MasterStatus;
}

const productSchema = new Schema<ProductDoc>({
  name: { type: String, required: true },
  sku: { type: String, required: true },
  skuKey: { type: String, required: true, unique: true },
  category: { type: String, required: true },
  // Saved before these existed: absent, read as null.
  composition: { type: String, default: null },
  type: { type: String, enum: [...PRODUCT_TYPES, null], default: null },
  packSize: { type: String, default: null },
  ptsPaise: { type: Number, min: 0, default: null },
  ptrPaise: { type: Number, min: 0, default: null },
  mrpPaise: { type: Number, min: 0, default: null },
  gstPercent: { type: Number, enum: [...GST_RATES, null], default: null },
  division: { type: String, default: null },
  status: { type: String, required: true, enum: MASTER_STATUSES },
});
productSchema.index({ category: 1, status: 1 });

export const ProductModel = model<ProductDoc>('Product', productSchema);
