import { Types, type ClientSession, type FilterQuery } from 'mongoose';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { DoctorGift, DoctorService } from '../domain/serviceGift.entity.js';
import type { DoctorGiftRepositoryPort, DoctorServiceRepositoryPort } from '../domain/records.repository.port.js';
import { DoctorGiftModel, DoctorServiceModel, type DoctorGiftDoc, type DoctorServiceDoc } from './serviceGift.schema.js';

const oid = (id: string) => new Types.ObjectId(id);

const toService = (d: DoctorServiceDoc & { _id: unknown }): DoctorService => ({
  id: String(d._id),
  doctorId: String(d.doctorId),
  userId: String(d.userId),
  createdBy: String(d.createdBy),
  origin: d.origin,
  serviceType: d.serviceType,
  amountPaise: d.amountPaise,
  remarks: d.remarks,
  clientId: d.clientId,
  createdAt: d.createdAt,
  doneBy: d.doneBy ? String(d.doneBy) : null,
  doneAt: d.doneAt ?? null,
});
const toGift = (d: DoctorGiftDoc & { _id: unknown }): DoctorGift => ({
  id: String(d._id),
  doctorId: String(d.doctorId),
  allocatedBy: String(d.allocatedBy),
  productName: d.productName,
  amountPaise: d.amountPaise,
  status: d.status,
  origin: d.origin ?? 'ADMIN',
  requestedBy: d.requestedBy ? String(d.requestedBy) : null,
  requestNote: d.requestNote ?? null,
  rejectReason: d.rejectReason ?? null,
  completedBy: d.completedBy ? String(d.completedBy) : null,
  completedAt: d.completedAt,
  allocatedAt: d.allocatedAt,
});

export class MongoDoctorServiceAdapter implements DoctorServiceRepositoryPort {
  async create(input: Omit<DoctorService, 'id'>, ctx?: TransactionContext): Promise<DoctorService> {
    const [doc] = await DoctorServiceModel.create([{ ...input, doctorId: oid(input.doctorId), userId: oid(input.userId), createdBy: oid(input.createdBy), doneBy: null, doneAt: null }], ctx ? { session: ctx as ClientSession } : {});
    return toService(doc!.toObject());
  }
  async findById(id: string): Promise<DoctorService | null> {
    const doc = await DoctorServiceModel.findById(id).lean();
    return doc ? toService(doc) : null;
  }
  async list(filter: { userId?: string; userIds?: string[]; doctorId?: string; doctorIds?: string[] }, limit: number): Promise<DoctorService[]> {
    const q: FilterQuery<DoctorServiceDoc> = {};
    if (filter.userId) q.userId = oid(filter.userId);
    else if (filter.userIds) q.userId = { $in: filter.userIds.map(oid) };
    if (filter.doctorId) q.doctorId = oid(filter.doctorId);
    else if (filter.doctorIds) q.doctorId = { $in: filter.doctorIds.map(oid) };
    return (await DoctorServiceModel.find(q).sort({ createdAt: -1, _id: -1 }).limit(limit).lean()).map(toService);
  }
  async markDone(id: string, by: string, at: Date): Promise<boolean> {
    const res = await DoctorServiceModel.updateOne({ _id: oid(id), doneAt: null }, { $set: { doneBy: oid(by), doneAt: at } });
    return res.modifiedCount === 1;
  }
}

export class MongoDoctorGiftAdapter implements DoctorGiftRepositoryPort {
  async create(input: Omit<DoctorGift, 'id'>): Promise<DoctorGift> {
    const doc = await DoctorGiftModel.create({ ...input, doctorId: oid(input.doctorId), allocatedBy: oid(input.allocatedBy), requestedBy: input.requestedBy ? oid(input.requestedBy) : null, completedBy: null });
    return toGift(doc.toObject());
  }
  async findById(id: string): Promise<DoctorGift | null> {
    const doc = await DoctorGiftModel.findById(id).lean();
    return doc ? toGift(doc) : null;
  }
  async list(filter: { doctorIds?: string[]; status?: DoctorGift['status']; statuses?: DoctorGift['status'][] }, limit: number): Promise<DoctorGift[]> {
    const q: FilterQuery<DoctorGiftDoc> = {};
    if (filter.doctorIds) q.doctorId = { $in: filter.doctorIds.map(oid) };
    if (filter.status) q.status = filter.status;
    else if (filter.statuses) q.status = { $in: filter.statuses };
    return (await DoctorGiftModel.find(q).sort({ allocatedAt: -1, _id: -1 }).limit(limit).lean()).map(toGift);
  }
  async accept(id: string, by: string, amountPaise: number, at: Date): Promise<boolean> {
    const res = await DoctorGiftModel.updateOne({ _id: oid(id), status: 'REQUESTED' }, { $set: { status: 'PENDING', amountPaise, allocatedBy: oid(by), allocatedAt: at } });
    return res.modifiedCount === 1;
  }
  async reject(id: string, by: string, reason: string): Promise<boolean> {
    const res = await DoctorGiftModel.updateOne({ _id: oid(id), status: 'REQUESTED' }, { $set: { status: 'REJECTED', allocatedBy: oid(by), rejectReason: reason } });
    return res.modifiedCount === 1;
  }
  async markDone(id: string, by: string, at: Date, ctx: TransactionContext): Promise<boolean> {
    const res = await DoctorGiftModel.updateOne({ _id: oid(id), status: 'PENDING' }, { $set: { status: 'DONE', completedBy: oid(by), completedAt: at } }, { session: ctx as ClientSession });
    return res.modifiedCount === 1;
  }
}
