import type { InboxSource } from '@greynote/contracts';
import { Types } from 'mongoose';
import { toSkipLimit } from '@/shared/http/pagination.js';
import type { InboxMessageRepositoryPort, InboxReceiptRepositoryPort } from '../domain/inbox.repository.port.js';
import type { InboxMessage } from '../domain/inboxMessage.entity.js';
import type { InboxReceipt } from '../domain/inboxReceipt.entity.js';
import { InboxMessageModel, type InboxMessageDoc } from './inboxMessage.schema.js';
import { InboxReceiptModel, type InboxReceiptDoc } from './inboxReceipt.schema.js';

const oid = (id: string) => new Types.ObjectId(id);

const toMessage = (doc: InboxMessageDoc & { _id: unknown }): InboxMessage => ({
  id: String(doc._id),
  title: doc.title,
  body: doc.body,
  kind: doc.kind,
  audience: {
    everyone: doc.audience.everyone,
    roles: [...doc.audience.roles],
    zoneIds: doc.audience.zoneIds.map(String),
    hqIds: doc.audience.hqIds.map(String),
    userIds: doc.audience.userIds.map(String),
  },
  attachments: (doc.attachments ?? []).map((a) => ({ id: a.id, name: a.name, kind: a.kind, sizeBytes: a.sizeBytes, url: a.url, publicId: a.publicId, resourceType: a.resourceType })),
  recipientCount: doc.recipientCount,
  createdBy: doc.createdBy ? String(doc.createdBy) : null,
  createdAt: doc.createdAt,
  expiresAt: doc.expiresAt,
  retractedAt: doc.retractedAt,
});

const toReceipt = (doc: InboxReceiptDoc): InboxReceipt => ({
  messageId: String(doc.messageId),
  userId: String(doc.userId),
  title: doc.title,
  body: doc.body,
  kind: doc.kind,
  attachments: (doc.attachments ?? []).map((a) => ({ id: a.id, name: a.name, kind: a.kind, sizeBytes: a.sizeBytes, url: a.url })),
  sentAt: doc.sentAt,
  expiresAt: doc.expiresAt,
  readAt: doc.readAt,
});

export class MongoInboxMessageAdapter implements InboxMessageRepositoryPort {
  async create(input: Omit<InboxMessage, 'id' | 'createdAt' | 'retractedAt'>): Promise<InboxMessage> {
    const doc = await InboxMessageModel.create({
      ...input,
      audience: {
        everyone: input.audience.everyone,
        roles: input.audience.roles,
        zoneIds: input.audience.zoneIds.map(oid),
        hqIds: input.audience.hqIds.map(oid),
        userIds: input.audience.userIds.map(oid),
      },
      createdBy: input.createdBy ? oid(input.createdBy) : null,
      createdAt: new Date(),
      retractedAt: null,
    });
    return toMessage(doc.toObject());
  }

  async findById(id: string): Promise<InboxMessage | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await InboxMessageModel.findById(id).lean();
    return doc ? toMessage(doc) : null;
  }

  async list(page: { page: number; pageSize: number }, filter: { source?: InboxSource } = {}): Promise<{ items: InboxMessage[]; total: number }> {
    const { skip, limit } = toSkipLimit(page);
    const query = filter.source === 'SYSTEM' ? { createdBy: null } : filter.source === 'ADMIN' ? { createdBy: { $ne: null } } : {};
    const [docs, total] = await Promise.all([InboxMessageModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(), InboxMessageModel.countDocuments(query)]);
    return { items: docs.map(toMessage), total };
  }

  async retract(id: string, at: Date): Promise<boolean> {
    return (await InboxMessageModel.updateOne({ _id: id, retractedAt: null }, { retractedAt: at })).modifiedCount === 1;
  }

  async findSystemIds(filter: { before?: Date; limit: number }): Promise<string[]> {
    const docs = await InboxMessageModel.find({ createdBy: null, ...(filter.before && { createdAt: { $lt: filter.before } }) })
      .sort({ createdAt: 1 })
      .limit(filter.limit)
      .select('_id')
      .lean();
    return docs.map((d) => String(d._id));
  }

  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length > 0) await InboxMessageModel.deleteMany({ _id: { $in: ids.map(oid) } });
  }
}

export class MongoInboxReceiptAdapter implements InboxReceiptRepositoryPort {
  async insertMany(receipts: InboxReceipt[]): Promise<void> {
    if (receipts.length === 0) return;
    await InboxReceiptModel.insertMany(receipts.map((r) => ({ ...r, messageId: oid(r.messageId), userId: oid(r.userId) })));
  }

  private visible(userId: string, now: Date, unreadOnly: boolean) {
    return {
      userId: oid(userId),
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
      ...(unreadOnly && { readAt: null }),
    };
  }

  async listForUser(userId: string, filter: { unreadOnly: boolean; now: Date }, page: { page: number; pageSize: number }): Promise<{ items: InboxReceipt[]; total: number }> {
    const query = this.visible(userId, filter.now, filter.unreadOnly);
    const { skip, limit } = toSkipLimit(page);
    const [docs, total] = await Promise.all([InboxReceiptModel.find(query).sort({ sentAt: -1, _id: -1 }).skip(skip).limit(limit).lean(), InboxReceiptModel.countDocuments(query)]);
    return { items: docs.map(toReceipt), total };
  }

  countUnread(userId: string, now: Date): Promise<number> {
    return InboxReceiptModel.countDocuments(this.visible(userId, now, true));
  }

  async markRead(userId: string, messageId: string, at: Date): Promise<boolean> {
    if (!Types.ObjectId.isValid(messageId)) return false;
    const filter = { userId: oid(userId), messageId: oid(messageId) };
    // Set `readAt` only the first time, so it records when it was first opened.
    await InboxReceiptModel.updateOne({ ...filter, readAt: null }, { readAt: at });
    return (await InboxReceiptModel.exists(filter)) !== null;
  }

  async markAllRead(userId: string, at: Date): Promise<number> {
    return (await InboxReceiptModel.updateMany({ userId: oid(userId), readAt: null }, { readAt: at })).modifiedCount;
  }

  async deleteForMessage(messageId: string): Promise<void> {
    await InboxReceiptModel.deleteMany({ messageId: oid(messageId) });
  }

  async deleteForMessages(messageIds: string[]): Promise<void> {
    if (messageIds.length > 0) await InboxReceiptModel.deleteMany({ messageId: { $in: messageIds.map(oid) } });
  }

  async readCounts(messageIds: string[]): Promise<Map<string, number>> {
    if (messageIds.length === 0) return new Map();
    const rows = await InboxReceiptModel.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { messageId: { $in: messageIds.map(oid) }, readAt: { $ne: null } } },
      { $group: { _id: '$messageId', n: { $sum: 1 } } },
    ]);
    return new Map(rows.map((r) => [String(r._id), r.n]));
  }
}
