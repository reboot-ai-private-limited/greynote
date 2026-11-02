import { Schema, model, type Types } from 'mongoose';

export interface SecondaryAttachmentDoc {
  userId: Types.ObjectId;
  month: string;
  url: string;
  publicId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: Types.ObjectId;
  uploadedAt: Date;
}

const secondaryAttachmentSchema = new Schema<SecondaryAttachmentDoc>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  month: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
  url: { type: String, required: true },
  publicId: { type: String, required: true },
  fileName: { type: String, required: true },
  mimeType: { type: String, required: true },
  sizeBytes: { type: Number, required: true, min: 1 },
  uploadedBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  uploadedAt: { type: Date, required: true },
});
secondaryAttachmentSchema.index({ userId: 1, month: 1, uploadedAt: 1 });
export const SecondaryAttachmentModel = model<SecondaryAttachmentDoc>('SecondaryAttachment', secondaryAttachmentSchema);
