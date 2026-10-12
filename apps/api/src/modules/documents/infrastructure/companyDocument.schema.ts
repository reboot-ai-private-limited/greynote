import { Schema, model, type Types } from 'mongoose';
import { COMPANY_DOCUMENT_CATEGORIES, type CompanyDocumentCategory } from '../domain/companyDocument.entity.js';

export interface CompanyDocumentDoc {
  title: string;
  category: CompanyDocumentCategory;
  fileKind: 'pdf' | 'jpeg' | 'png';
  url: string;
  publicId: string;
  sizeBytes: number;
  everyone: boolean;
  userIds: Types.ObjectId[];
  uploadedBy: Types.ObjectId;
  uploadedAt: Date;
}

const schema = new Schema<CompanyDocumentDoc>({
  title: { type: String, required: true },
  category: { type: String, required: true, enum: COMPANY_DOCUMENT_CATEGORIES },
  fileKind: { type: String, required: true, enum: ['pdf', 'jpeg', 'png'] },
  url: { type: String, required: true },
  publicId: { type: String, required: true },
  sizeBytes: { type: Number, required: true },
  everyone: { type: Boolean, required: true },
  userIds: { type: [Schema.Types.ObjectId], default: [] },
  uploadedBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  uploadedAt: { type: Date, required: true },
});

schema.index({ uploadedAt: -1 });
schema.index({ userIds: 1, uploadedAt: -1 });

export const CompanyDocumentModel = model<CompanyDocumentDoc>('CompanyDocument', schema);
