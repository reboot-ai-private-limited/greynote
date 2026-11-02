import { Types } from 'mongoose';
import type { SecondaryAttachment } from '../domain/secondaryAttachment.entity.js';
import type { SecondaryAttachmentRepositoryPort } from '../domain/secondaryAttachment.repository.port.js';
import { SecondaryAttachmentModel, type SecondaryAttachmentDoc } from './secondaryAttachment.schema.js';

const oid = (id: string) => new Types.ObjectId(id);

const toAttachment = (d: SecondaryAttachmentDoc & { _id: unknown }): SecondaryAttachment => ({
  id: String(d._id),
  userId: String(d.userId),
  month: d.month,
  url: d.url,
  publicId: d.publicId,
  fileName: d.fileName,
  mimeType: d.mimeType,
  sizeBytes: d.sizeBytes,
  uploadedBy: String(d.uploadedBy),
  uploadedAt: d.uploadedAt,
});

export class MongoSecondaryAttachmentAdapter implements SecondaryAttachmentRepositoryPort {
  async add(input: Omit<SecondaryAttachment, 'id'>): Promise<SecondaryAttachment> {
    const doc = await SecondaryAttachmentModel.create({ ...input, userId: oid(input.userId), uploadedBy: oid(input.uploadedBy) });
    return toAttachment(doc.toObject());
  }
  async list(userId: string, month: string): Promise<SecondaryAttachment[]> {
    return (await SecondaryAttachmentModel.find({ userId: oid(userId), month }).sort({ uploadedAt: 1, _id: 1 }).lean()).map(toAttachment);
  }
  async findById(id: string): Promise<SecondaryAttachment | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await SecondaryAttachmentModel.findById(id).lean();
    return doc ? toAttachment(doc) : null;
  }
  async remove(id: string): Promise<boolean> {
    return (await SecondaryAttachmentModel.deleteOne({ _id: oid(id) })).deletedCount === 1;
  }
}
