import { AppError } from '@/shared/errors/AppError.js';
import type { Designation, DesignationName } from '../domain/designation.entity.js';
import type { DesignationRepositoryPort } from '../domain/designation.repository.port.js';
import { DesignationModel } from './designation.schema.js';

function toDesignation(doc: { _id: unknown; name: DesignationName; level: number }): Designation {
  return { id: String(doc._id), name: doc.name, level: doc.level };
}

export class MongoDesignationAdapter implements DesignationRepositoryPort {
  async findById(id: string): Promise<Designation | null> {
    const doc = await DesignationModel.findById(id).lean();
    return doc ? toDesignation(doc) : null;
  }

  async findByName(name: DesignationName): Promise<Designation | null> {
    const doc = await DesignationModel.findOne({ name }).lean();
    return doc ? toDesignation(doc) : null;
  }

  async list(): Promise<Designation[]> {
    const docs = await DesignationModel.find().lean();
    return docs.map(toDesignation);
  }

  async create(input: Omit<Designation, 'id'>): Promise<Designation> {
    const doc = await DesignationModel.create(input);
    return toDesignation(doc);
  }

  async update(id: string, input: Partial<Omit<Designation, 'id'>>): Promise<Designation> {
    const doc = await DesignationModel.findByIdAndUpdate(id, input, { new: true }).lean();
    if (!doc) throw AppError.internal('INTERNAL', { reason: 'DESIGNATION_NOT_FOUND', id });
    return toDesignation(doc);
  }
}
