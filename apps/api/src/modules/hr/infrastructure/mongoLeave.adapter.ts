import { Types, type ClientSession } from 'mongoose';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { Leave, LeaveAttachment } from '../domain/leave.entity.js';
import type { LeaveBody, LeaveFilter, LeaveRepositoryPort } from '../domain/leave.repository.port.js';
import { LeaveModel, type LeaveDoc } from './leave.schema.js';

const toLeave = (doc: LeaveDoc & { _id: unknown }): Leave => ({
  id: String(doc._id),
  userId: String(doc.userId),
  leaveTypeId: String(doc.leaveTypeId),
  isPaid: doc.isPaid,
  year: doc.year,
  startDate: doc.startDate,
  endDate: doc.endDate,
  half: doc.half,
  reason: doc.reason,
  days: doc.days.map((d) => ({ date: d.date, portion: d.portion })),
  daysCount: doc.daysCount,
  ledgerDays: doc.ledgerDays ?? doc.daysCount,
  attachments: (doc.attachments ?? []).map((a) => ({ id: String(a._id), url: a.url, publicId: a.publicId, fileName: a.fileName, mimeType: a.mimeType, sizeBytes: a.sizeBytes, uploadedAt: a.uploadedAt })),
  revision: doc.revision,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

const toDoc = (body: LeaveBody) => ({ ...body, leaveTypeId: new Types.ObjectId(body.leaveTypeId) });
const session = (ctx: TransactionContext) => ({ session: ctx as ClientSession });
const meets = (from?: string, to?: string) => ({
  ...(to !== undefined && { startDate: { $lte: to } }),
  ...(from !== undefined && { endDate: { $gte: from } }),
});

export class MongoLeaveAdapter implements LeaveRepositoryPort {
  async findById(id: string): Promise<Leave | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await LeaveModel.findById(id).lean();
    return doc ? toLeave(doc) : null;
  }

  async listOverlapping(userId: string, from: string, to: string): Promise<Leave[]> {
    const docs = await LeaveModel.find({ userId: new Types.ObjectId(userId), ...meets(from, to) }).sort({ startDate: 1 }).lean();
    return docs.map(toLeave);
  }

  async list(filter: LeaveFilter, page: { page: number; pageSize: number }): Promise<{ items: Leave[]; total: number }> {
    const query = {
      ...(filter.userIds && { userId: { $in: filter.userIds.map((id) => new Types.ObjectId(id)) } }),
      ...meets(filter.from, filter.to),
    };
    const [docs, total] = await Promise.all([
      LeaveModel.find(query)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page.page - 1) * page.pageSize)
        .limit(page.pageSize)
        .lean(),
      LeaveModel.countDocuments(query),
    ]);
    return { items: docs.map(toLeave), total };
  }

  async create(userId: string, body: LeaveBody, ctx: TransactionContext): Promise<Leave> {
    const now = new Date();
    const [doc] = await LeaveModel.create(
      [{ ...toDoc(body), userId: new Types.ObjectId(userId), revision: 1, createdAt: now, updatedAt: now }],
      session(ctx),
    );
    if (!doc) throw AppError.internal('INTERNAL', { reason: 'LEAVE_CREATE_RETURNED_NOTHING' });
    return toLeave(doc.toObject());
  }

  async replace(id: string, expectedRevision: number, body: LeaveBody, ctx: TransactionContext): Promise<Leave | null> {
    const doc = await LeaveModel.findOneAndUpdate(
      { _id: id, revision: expectedRevision },
      { $set: { ...toDoc(body), updatedAt: new Date() }, $inc: { revision: 1 } },
      { new: true, ...session(ctx) },
    ).lean();
    return doc ? toLeave(doc) : null;
  }

  async addAttachment(leaveId: string, attachment: Omit<LeaveAttachment, 'id'>, max: number): Promise<Leave | null> {
    if (!Types.ObjectId.isValid(leaveId)) return null;
    const doc = await LeaveModel.findOneAndUpdate(
      { _id: leaveId, $expr: { $lt: [{ $size: { $ifNull: ['$attachments', []] } }, max] } },
      { $push: { attachments: { _id: new Types.ObjectId(), ...attachment } } },
      { new: true },
    ).lean();
    return doc ? toLeave(doc) : null;
  }

  async removeAttachment(leaveId: string, attachmentId: string): Promise<LeaveAttachment | null> {
    if (!Types.ObjectId.isValid(leaveId) || !Types.ObjectId.isValid(attachmentId)) return null;
    const before = await LeaveModel.findOneAndUpdate({ _id: leaveId, 'attachments._id': new Types.ObjectId(attachmentId) }, { $pull: { attachments: { _id: new Types.ObjectId(attachmentId) } } }, { new: false }).lean();
    return before ? (toLeave(before).attachments.find((a) => a.id === attachmentId) ?? null) : null;
  }

  async existsForLeaveType(leaveTypeId: string): Promise<boolean> {
    return (await LeaveModel.exists({ leaveTypeId: new Types.ObjectId(leaveTypeId) })) !== null;
  }
}
