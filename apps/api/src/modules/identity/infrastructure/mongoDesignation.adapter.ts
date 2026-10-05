import { DESIGNATION_LEVEL, type Designation, type DesignationName } from '../domain/designation.entity.js';
import type { DesignationRepositoryPort } from '../domain/designation.repository.port.js';
import { DesignationModel } from './designation.schema.js';

function toDesignation(doc: { _id: unknown; name: DesignationName }): Designation {
  // The level follows from the name, so a row saved with a different one (it used to be typed in) reads correctly anyway.
  return { id: String(doc._id), name: doc.name, level: DESIGNATION_LEVEL[doc.name] };
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
}
