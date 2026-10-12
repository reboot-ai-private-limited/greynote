import { Types } from 'mongoose';
import type { CompanyDocumentRepositoryPort } from '../domain/documents.repository.port.js';
import type { CompanyDocument } from '../domain/companyDocument.entity.js';
import { CompanyDocumentModel, type CompanyDocumentDoc } from './companyDocument.schema.js';

const toDocument = (doc: CompanyDocumentDoc & { _id: unknown }): CompanyDocument => ({
  id: String(doc._id),
  title: doc.title,
  category: doc.category,
  fileKind: doc.fileKind,
  url: doc.url,
  publicId: doc.publicId,
  sizeBytes: doc.sizeBytes,
  everyone: doc.everyone,
  userIds: doc.userIds.map(String),
  uploadedBy: String(doc.uploadedBy),
  uploadedAt: doc.uploadedAt,
});

export class MongoCompanyDocumentAdapter implements CompanyDocumentRepositoryPort {
  async create(input: Omit<CompanyDocument, 'id' | 'uploadedAt'>): Promise<CompanyDocument> {
    const created = await CompanyDocumentModel.create({ ...input, userIds: input.userIds.map((id) => new Types.ObjectId(id)), uploadedBy: new Types.ObjectId(input.uploadedBy), uploadedAt: new Date() });
    return toDocument(created.toObject());
  }

  async findById(id: string): Promise<CompanyDocument | null> {
    const doc = await CompanyDocumentModel.findById(id).lean();
    return doc ? toDocument(doc) : null;
  }

  async listAll(): Promise<CompanyDocument[]> {
    return (await CompanyDocumentModel.find().sort({ uploadedAt: -1 }).limit(500).lean()).map(toDocument);
  }

  async listVisibleTo(userId: string): Promise<CompanyDocument[]> {
    const docs = await CompanyDocumentModel.find({ $or: [{ everyone: true }, { userIds: new Types.ObjectId(userId) }] })
      .sort({ uploadedAt: -1 })
      .limit(500)
      .lean();
    return docs.map(toDocument);
  }

  async delete(id: string): Promise<boolean> {
    return (await CompanyDocumentModel.deleteOne({ _id: new Types.ObjectId(id) })).deletedCount === 1;
  }
}
