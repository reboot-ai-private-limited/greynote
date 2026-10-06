import { AppError } from '@/shared/errors/AppError.js';
import { payBandNameKey, type PayBand } from '../domain/payBand.entity.js';
import type { PayBandRepositoryPort } from '../domain/payBand.repository.port.js';
import { PayBandModel } from './payBand.schema.js';

function toPayBand(doc: { _id: unknown } & Omit<PayBand, 'id'>): PayBand {
  return {
    id: String(doc._id),
    name: doc.name,
    taPerKmRatePaise: doc.taPerKmRatePaise,
    hqDaPaise: doc.hqDaPaise,
    exStationDaPaise: doc.exStationDaPaise,
    outStationDaPaise: doc.outStationDaPaise,
  };
}

export class MongoPayBandAdapter implements PayBandRepositoryPort {
  async findById(id: string): Promise<PayBand | null> {
    const doc = await PayBandModel.findById(id).lean();
    return doc ? toPayBand(doc) : null;
  }

  async findByName(name: string): Promise<PayBand | null> {
    const doc = await PayBandModel.findOne({ nameKey: payBandNameKey(name) }).lean();
    return doc ? toPayBand(doc) : null;
  }

  async list(): Promise<PayBand[]> {
    const docs = await PayBandModel.find().lean();
    return docs.map(toPayBand);
  }

  async create(input: Omit<PayBand, 'id'>): Promise<PayBand> {
    const doc = await PayBandModel.create({ ...input, nameKey: payBandNameKey(input.name) });
    return toPayBand(doc.toObject());
  }

  async update(id: string, input: Partial<Omit<PayBand, 'id'>>): Promise<PayBand> {
    const change = input.name === undefined ? input : { ...input, nameKey: payBandNameKey(input.name) };
    const doc = await PayBandModel.findByIdAndUpdate(id, change, { new: true, runValidators: true }).lean();
    if (!doc) throw AppError.internal('INTERNAL', { reason: 'PAY_BAND_NOT_FOUND', id });
    return toPayBand(doc);
  }
}
