import { Schema, model, type Types } from 'mongoose';
import { SAMPLE_REQUEST_KINDS, SAMPLE_REQUEST_STATUSES, type SampleRequestKind, type SampleRequestStatus } from '../domain/sampleRequest.entity.js';

export interface SampleRequestDoc {
  userId: Types.ObjectId;
  kind: SampleRequestKind;
  lines: Array<{ productId: Types.ObjectId; quantity: number; creditedQuantity: number | null }>;
  remarks: string | null;
  status: SampleRequestStatus;
  requestedAt: Date;
  doneBy: Types.ObjectId | null;
  doneAt: Date | null;
}
const schema = new Schema<SampleRequestDoc>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  kind: { type: String, required: true, enum: [...SAMPLE_REQUEST_KINDS] },
  lines: {
    type: [new Schema({ productId: { type: Schema.Types.ObjectId, required: true, ref: 'Product' }, quantity: { type: Number, required: true, min: 1 }, creditedQuantity: { type: Number, default: null, min: 0 } }, { _id: false })],
    required: true,
  },
  remarks: { type: String, default: null },
  status: { type: String, required: true, enum: [...SAMPLE_REQUEST_STATUSES], default: 'REQUESTED' },
  requestedAt: { type: Date, required: true },
  doneBy: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
  doneAt: { type: Date, default: null },
});
schema.index({ userId: 1, requestedAt: -1 });
schema.index({ status: 1, requestedAt: -1 });
export const SampleRequestModel = model<SampleRequestDoc>('SampleRequest', schema);
