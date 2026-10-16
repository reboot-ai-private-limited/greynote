import { Types, type FilterQuery } from 'mongoose';
import type { Campaign, CampaignStatus, DoctorVisual, Target, TargetKey, Visual, VisualStatus } from '../domain/marketing.entities.js';
import type { CampaignRepositoryPort, DoctorVisualRepositoryPort, TargetRepositoryPort, VisualRepositoryPort } from '../domain/marketing.repository.ports.js';
import { CampaignModel, DoctorVisualModel, TargetModel, VisualModel, type CampaignDoc, type DoctorVisualDoc, type TargetDoc, type VisualDoc } from './marketing.schema.js';

const isDuplicateKey = (err: unknown) => (err as { code?: number }).code === 11000;
const oid = (id: string) => new Types.ObjectId(id);
const oidOrNull = (id: string | null) => (id ? oid(id) : null);
const idOrNull = (id: Types.ObjectId | null) => (id ? String(id) : null);

const toVisual = (d: VisualDoc & { _id: unknown }): Visual => ({ id: String(d._id), productId: idOrNull(d.productId), title: d.title, category: d.category, fileUrl: d.fileUrl, publicId: d.publicId, mimeType: d.mimeType, uploadedBy: String(d.uploadedBy), status: d.status, createdAt: d.createdAt });
const toCampaign = (d: CampaignDoc & { _id: unknown }): Campaign => ({ id: String(d._id), name: d.name, description: d.description, startDate: d.startDate, endDate: d.endDate, status: d.status, createdBy: String(d.createdBy), createdAt: d.createdAt });
const toTarget = (d: TargetDoc & { _id: unknown }): Target => ({ id: String(d._id), userId: String(d.userId), month: d.month, toMonth: d.toMonth ?? d.month, productId: idOrNull(d.productId), campaignId: idOrNull(d.campaignId), targetAmountPaise: d.targetAmountPaise, targetQty: d.targetQty ?? null, createdBy: String(d.createdBy), createdAt: d.createdAt, updatedAt: d.updatedAt });

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
  async findByIds(ids: string[]): Promise<Visual[]> {
    if (ids.length === 0) return [];
    return (await VisualModel.find({ _id: { $in: ids.map(oid) } }).lean()).map(toVisual);
  }
  async setStatus(id: string, status: VisualStatus): Promise<Visual | null> {
    const doc = await VisualModel.findByIdAndUpdate(id, { $set: { status } }, { new: true }).lean();
    return doc ? toVisual(doc) : null;
  }
  async update(id: string, patch: { title?: string | undefined; category?: Visual['category'] | undefined; productId?: string | null | undefined; status?: VisualStatus | undefined }): Promise<Visual | null> {
    const set: Partial<VisualDoc> = {};
    if (patch.title !== undefined) set.title = patch.title;
    if (patch.category !== undefined) set.category = patch.category;
    if (patch.productId !== undefined) set.productId = oidOrNull(patch.productId);
    if (patch.status !== undefined) set.status = patch.status;
    const doc = await VisualModel.findByIdAndUpdate(id, { $set: set }, { new: true }).lean();
    return doc ? toVisual(doc) : null;
  }
  async replaceFile(id: string, file: { fileUrl: string; publicId: string; mimeType: string }): Promise<Visual | null> {
    const before = await VisualModel.findByIdAndUpdate(id, { $set: file }, { new: false }).lean();
    return before ? toVisual(before) : null;
  }
  async delete(id: string): Promise<Visual | null> {
    const doc = await VisualModel.findByIdAndDelete(id).lean();
    return doc ? toVisual(doc) : null;
  }
}

const toDoctorVisual = (d: DoctorVisualDoc & { _id: unknown }): DoctorVisual => ({ id: String(d._id), doctorId: String(d.doctorId), visualId: String(d.visualId), addedBy: String(d.addedBy), addedAt: d.addedAt, removedBy: idOrNull(d.removedBy), removedAt: d.removedAt });

export class MongoDoctorVisualAdapter implements DoctorVisualRepositoryPort {
  async listActive(doctorId: string): Promise<DoctorVisual[]> {
    return (await DoctorVisualModel.find({ doctorId: oid(doctorId), removedAt: null }).sort({ addedAt: 1, _id: 1 }).lean()).map(toDoctorVisual);
  }
  async addMany(doctorId: string, visualIds: string[], by: string, at: Date): Promise<void> {
    if (visualIds.length === 0) return;
    const ops = visualIds.flatMap((visualId) => {
      const key = { doctorId: oid(doctorId), visualId: oid(visualId) };
      return [
        // A pick removed earlier comes back as added now ...
        { updateOne: { filter: { ...key, removedAt: { $ne: null } }, update: { $set: { addedBy: oid(by), addedAt: at, removedAt: null, removedBy: null } } } },
        // ... and one never picked is inserted; one already on the list is left exactly as it was.
        { updateOne: { filter: key, update: { $setOnInsert: { addedBy: oid(by), addedAt: at, removedAt: null, removedBy: null } }, upsert: true } },
      ];
    });
    try {
      await DoctorVisualModel.bulkWrite(ops, { ordered: true });
    } catch (err) {
      // Two first-time adds of the same pick race to insert; the loser has nothing left to do.
      if (!isDuplicateKey(err) && !(err as { writeErrors?: Array<{ code?: number }> }).writeErrors?.every((e) => e.code === 11000)) throw err;
    }
  }
  async remove(doctorId: string, visualId: string, by: string, at: Date): Promise<boolean> {
    const res = await DoctorVisualModel.updateOne({ doctorId: oid(doctorId), visualId: oid(visualId), removedAt: null }, { $set: { removedAt: at, removedBy: oid(by) } });
    return res.modifiedCount === 1;
  }
  async countDoctorsWith(visualId: string): Promise<number> {
    return (await DoctorVisualModel.distinct('doctorId', { visualId: oid(visualId), removedAt: null })).length;
  }
  async deleteAllFor(visualId: string): Promise<void> {
    await DoctorVisualModel.deleteMany({ visualId: oid(visualId) });
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

export class MongoTargetAdapter implements TargetRepositoryPort {
  private filter(key: TargetKey): FilterQuery<TargetDoc> {
    return { userId: oid(key.userId), month: key.month, toMonth: key.toMonth, productId: oidOrNull(key.productId), campaignId: oidOrNull(key.campaignId) };
  }

  async upsert(key: TargetKey, amountPaise: number, qty: number | null, by: string, at: Date): Promise<Target> {
    const run = () =>
      TargetModel.findOneAndUpdate(this.filter(key), { $set: { targetAmountPaise: amountPaise, targetQty: qty, createdBy: oid(by), updatedAt: at }, $setOnInsert: { createdAt: at } }, { upsert: true, new: true, runValidators: true }).lean();
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
