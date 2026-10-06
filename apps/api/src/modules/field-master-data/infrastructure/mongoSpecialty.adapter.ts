import { Types } from 'mongoose';
import { buildPaginatedResult, toSkipLimit, type PaginatedResult } from '@/shared/http/pagination.js';
import type { MasterStatus } from '../domain/masterStatus.js';
import type { Specialty } from '../domain/specialty.entity.js';
import type { SpecialtyFilter, SpecialtyRepositoryPort } from '../domain/specialty.repository.port.js';
import { escapeRegex, isDuplicateKey } from './mongoHelpers.js';
import { SpecialtyModel, type SpecialtyDoc } from './specialty.schema.js';

const toKey = (name: string): string => name.trim().toLowerCase();
const toSpecialty = (doc: SpecialtyDoc & { _id: unknown }): Specialty => ({ id: String(doc._id), name: doc.name, status: doc.status });

export class MongoSpecialtyAdapter implements SpecialtyRepositoryPort {
  async list(filter: SpecialtyFilter): Promise<PaginatedResult<Specialty>> {
    const query: Record<string, unknown> = {};
    if (filter.status) query['status'] = filter.status;
    if (filter.search) query['name'] = new RegExp(escapeRegex(filter.search), 'i');
    const [docs, total] = await Promise.all([
      SpecialtyModel.find(query).sort({ nameKey: 1 }).skip(toSkipLimit(filter).skip).limit(filter.pageSize).lean(),
      SpecialtyModel.countDocuments(query),
    ]);
    return buildPaginatedResult(docs.map(toSpecialty), total, filter);
  }

  async findById(id: string): Promise<Specialty | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await SpecialtyModel.findById(id).lean();
    return doc ? toSpecialty(doc) : null;
  }

  async findByName(name: string): Promise<Specialty | null> {
    const doc = await SpecialtyModel.findOne({ nameKey: toKey(name) }).lean();
    return doc ? toSpecialty(doc) : null;
  }

  async listActive(): Promise<Specialty[]> {
    return (await SpecialtyModel.find({ status: 'active' }).sort({ nameKey: 1 }).lean()).map(toSpecialty);
  }

  async create(input: { name: string }): Promise<Specialty | null> {
    try {
      const doc = await SpecialtyModel.create({ name: input.name, nameKey: toKey(input.name), status: 'active' });
      return toSpecialty(doc.toObject());
    } catch (err) {
      if (isDuplicateKey(err)) return null;
      throw err;
    }
  }

  async update(id: string, change: { name?: string; status?: MasterStatus }): Promise<Specialty | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    try {
      const set: Partial<SpecialtyDoc> = { ...(change.status && { status: change.status }), ...(change.name !== undefined && { name: change.name, nameKey: toKey(change.name) }) };
      const doc = await SpecialtyModel.findByIdAndUpdate(id, { $set: set }, { new: true }).lean();
      return doc ? toSpecialty(doc) : null;
    } catch (err) {
      if (isDuplicateKey(err)) return null;
      throw err;
    }
  }

  async addMissing(names: string[]): Promise<number> {
    let added = 0;
    for (const name of names) {
      const trimmed = name.trim();
      if (trimmed === '') continue;
      const res = await SpecialtyModel.updateOne({ nameKey: toKey(trimmed) }, { $setOnInsert: { name: trimmed, nameKey: toKey(trimmed), status: 'active' } }, { upsert: true });
      if (res.upsertedCount === 1) added += 1;
    }
    return added;
  }
}
