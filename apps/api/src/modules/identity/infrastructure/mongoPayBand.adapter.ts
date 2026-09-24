import { Types } from 'mongoose';
import { AppError } from '@/shared/errors/AppError.js';
import { PAY_BAND_MONEY_FIELDS, type PayBand, type PayBandName } from '../domain/payBand.entity.js';
import type { PayBandRepositoryPort } from '../domain/payBand.repository.port.js';
import { PayBandModel } from './payBand.schema.js';

type PayBandDoc = { _id: unknown; name: PayBandName } & Record<
  (typeof PAY_BAND_MONEY_FIELDS)[number],
  Types.Decimal128
>;

/** Domain keeps money as decimal strings (no Mongoose in domain/) — conversion lives only here. */
function toPayBand(doc: PayBandDoc): PayBand {
  return {
    id: String(doc._id),
    name: doc.name,
    baseSalary: doc.baseSalary.toString(),
    taPerKmRate: doc.taPerKmRate.toString(),
    hqDa: doc.hqDa.toString(),
    exStationDa: doc.exStationDa.toString(),
    outStationDa: doc.outStationDa.toString(),
  };
}

function toDecimalFields(input: Partial<Omit<PayBand, 'id' | 'name'>>) {
  const fields: Record<string, Types.Decimal128> = {};
  for (const field of PAY_BAND_MONEY_FIELDS) {
    const value = input[field];
    if (value !== undefined) fields[field] = Types.Decimal128.fromString(value);
  }
  return fields;
}

export class MongoPayBandAdapter implements PayBandRepositoryPort {
  async findById(id: string): Promise<PayBand | null> {
    const doc = await PayBandModel.findById(id).lean();
    return doc ? toPayBand(doc) : null;
  }

  async findByName(name: PayBandName): Promise<PayBand | null> {
    const doc = await PayBandModel.findOne({ name }).lean();
    return doc ? toPayBand(doc) : null;
  }

  async list(): Promise<PayBand[]> {
    const docs = await PayBandModel.find().lean();
    return docs.map(toPayBand);
  }

  async create(input: Omit<PayBand, 'id'>): Promise<PayBand> {
    const doc = await PayBandModel.create({ name: input.name, ...toDecimalFields(input) });
    return toPayBand(doc);
  }

  async update(id: string, input: Partial<Omit<PayBand, 'id'>>): Promise<PayBand> {
    const { name, ...money } = input;
    const doc = await PayBandModel.findByIdAndUpdate(
      id,
      { ...(name ? { name } : {}), ...toDecimalFields(money) },
      { new: true },
    ).lean();
    if (!doc) throw AppError.internal('INTERNAL', { reason: 'PAY_BAND_NOT_FOUND', id });
    return toPayBand(doc);
  }
}
