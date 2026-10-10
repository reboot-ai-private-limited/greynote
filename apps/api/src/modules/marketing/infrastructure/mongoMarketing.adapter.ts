import { Types, type FilterQuery } from 'mongoose';
import type { Campaign, CampaignStatus, Target, TargetKey, Visual, VisualStatus } from '../domain/marketing.entities.js';
import type { CampaignRepositoryPort, TargetRepositoryPort, VisualRepositoryPort } from '../domain/marketing.repository.ports.js';
import { CampaignModel, TargetModel, VisualModel, type CampaignDoc, type TargetDoc, type VisualDoc } from './marketing.schema.js';

const oid = (id: string) => new Types.ObjectId(id);
const oidOrNull = (id: string | null) => (id ? oid(id) : null);
const idOrNull = (id: Types.ObjectId | null) => (id ? String(id) : null);

const toVisual = (d: VisualDoc & { _id: unknown }): Visual => ({ id: String(d._id), productId: idOrNull(d.productId), title: d.title, category: d.category, fileUrl: d.fileUrl, publicId: d.publicId, mimeType: d.mimeType, uploadedBy: String(d.uploadedBy), status: d.status, createdAt: d.createdAt });
const toCampaign = (d: CampaignDoc & { _id: unknown }): Campaign => ({ id: String(d._id), name: d.name, description: d.description, startDate: d.startDate, endDate: d.endDate, status: d.status, createdBy: String(d.createdBy), createdAt: d.createdAt });
const toTarget = (d: TargetDoc & { _id: unknown }): Target => ({ id: String(d._id), userId: String(d.userId), month: d.month, toMonth: d.toMonth ?? d.month, productId: idOrNull(d.productId), campaignId: idOrNull(d.campaignId), targetAmountPaise: d.targetAmountPaise, createdBy: String(d.createdBy), createdAt: d.createdAt, updatedAt: d.updatedAt });

export class MongoVisualAdapter implements VisualRepositoryPort {
  async create(input: Omit<Visual, 'id'>): Promise<Visual> {
    const doc = await VisualModel.create({ ...input, productId: oidOrNull(input.productId), uploadedBy: oid(input.uploadedBy) });
    return toVisual(doc.toObject());
  }
  async findById(id: string): Promise<Visual | null> {
    const doc = await VisualModel.findById(id).lean();
    return doc ? toVisual(doc) : null;
  }
  async list(filter: { status?: VisualStatus | undefined; productId?: string | undefined }, limit: number): Promise<Visual[]> {
    const q: FilterQuery<VisualDoc> = {};
    if (filter.status) q.status = filter.status;
    if (filter.productId) q.productId = oid(filter.productId);
    return (await VisualModel.find(q).sort({ createdAt: -1, _id: -1 }).limit(limit).lean()).map(toVisual);
  }
  async setStatus(id: string, status: VisualStatus): Promise<Visual | null> {
    const doc = await VisualModel.findByIdAndUpdate(id, { $set: { status } }, { new: true }).lean();
    return doc ? toVisual(doc) : null;
  }
}

export class MongoCampaignAdapter implements CampaignRepositoryPort {
  async create(input: Omit<Campaign, 'id'>): Promise<Campaign> {
    const doc = await CampaignModel.create({ ...input, createdBy: oid(input.createdBy) });
    return toCampaign(doc.toObject());
  }
  async findById(id: string): Promise<Campaign | null> {
    const doc = await CampaignModel.findById(id).lean();
    return doc ? toCampaign(doc) : null;
  }
  async list(filter: { status?: CampaignStatus | undefined }, limit: number): Promise<Campaign[]> {
    return (await CampaignModel.find(filter.status ? { status: filter.status } : {}).sort({ startDate: -1, _id: -1 }).limit(limit).lean()).map(toCampaign);
  }
  async setStatus(id: string, status: CampaignStatus): Promise<Campaign | null> {
    const doc = await CampaignModel.findByIdAndUpdate(id, { $set: { status } }, { new: true }).lean();
    return doc ? toCampaign(doc) : null;
  }
}

const isDuplicateKey = (err: unknown) => (err as { code?: number }).code === 11000;

export class MongoTargetAdapter implements TargetRepositoryPort {
  private filter(key: TargetKey): FilterQuery<TargetDoc> {
    return { userId: oid(key.userId), month: key.month, toMonth: key.toMonth, productId: oidOrNull(key.productId), campaignId: oidOrNull(key.campaignId) };
  }

  async upsert(key: TargetKey, amountPaise: number, by: string, at: Date): Promise<Target> {
    const run = () =>
      TargetModel.findOneAndUpdate(this.filter(key), { $set: { targetAmountPaise: amountPaise, createdBy: oid(by), updatedAt: at }, $setOnInsert: { createdAt: at } }, { upsert: true, new: true, runValidators: true }).lean();
    try {
      return toTarget((await run())!);
    } catch (err) {
      // Two first-time sets of the same key race to insert; the loser's retry finds the winner's row and updates it.
      if (!isDuplicateKey(err)) throw err;
      return toTarget((await run())!);
    }
  }

  async findById(id: string): Promise<Target | null> {
    const doc = await TargetModel.findById(id).lean();
    return doc ? toTarget(doc) : null;
  }

  async remove(id: string): Promise<boolean> {
    return (await TargetModel.deleteOne({ _id: oid(id) })).deletedCount === 1;
  }

  async listOverlapping(userIds: string[], fromMonth: string, toMonth: string, scope: { productId?: string | null; campaignId?: string | null } = {}): Promise<Target[]> {
    if (userIds.length === 0) return [];
    const q: FilterQuery<TargetDoc> = { userId: { $in: userIds.map(oid) }, month: { $lte: toMonth }, $or: [{ toMonth: { $gte: fromMonth } }, { toMonth: { $exists: false }, month: { $gte: fromMonth } }] };
    if (scope.productId !== undefined) q.productId = oidOrNull(scope.productId);
    if (scope.campaignId !== undefined) q.campaignId = oidOrNull(scope.campaignId);
    return (await TargetModel.find(q).sort({ month: 1, _id: 1 }).lean()).map(toTarget);
  }
}
