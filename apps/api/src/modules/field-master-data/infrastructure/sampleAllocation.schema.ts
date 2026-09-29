import { Schema, model, type Types } from 'mongoose';

export interface SampleAllocationDoc {
  doctorId: Types.ObjectId;
  productId: Types.ObjectId;
  quantityAllocated: number;
  quantityRemaining: number;
  allocatedBy: Types.ObjectId;
  allocatedAt: Date;
}

const sampleAllocationSchema = new Schema<SampleAllocationDoc>({
  doctorId: { type: Schema.Types.ObjectId, required: true, ref: 'Doctor' },
  productId: { type: Schema.Types.ObjectId, required: true, ref: 'Product' },
  quantityAllocated: { type: Number, required: true, min: 0 },
  // The database refuses a negative count outright — the last line of defence behind the conditional update.
  quantityRemaining: { type: Number, required: true, min: 0 },
  allocatedBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  allocatedAt: { type: Date, required: true },
});
sampleAllocationSchema.index({ doctorId: 1, productId: 1 }, { unique: true });

export const SampleAllocationModel = model<SampleAllocationDoc>('SampleAllocation', sampleAllocationSchema);
