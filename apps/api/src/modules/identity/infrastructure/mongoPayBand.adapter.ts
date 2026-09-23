import { Types } from 'mongoose';
import { AppError } from '@/shared/errors/AppError.js';
import type { PayBand, PayBandName } from '../domain/payBand.entity.js';
import type { PayBandRepositoryPort } from '../domain/payBand.repository.port.js';
import { PayBandModel } from './payBand.schema.js';

interface PayBandDoc {
  _id: unknown;
  name: PayBandName;
  baseSalary: Types.Decimal128;
  taPerKmRate: Types.Decimal128;
  daAmount: Types.Decimal128;
}

/** Domain keeps money as decimal strings (no Mongoose in domain/) — conversion lives only here. */
function toPayBand(doc: PayBandDoc): PayBand {
  return {
    id: String(doc._id),
    name: doc.name,
    baseSalary: doc.baseSalary.toString(),
    taPerKmRate: doc.taPerKmRate.toString(),
    daAmount: doc.daAmount.toString(),
  };
}

function toDecimalFields(input: Partial<Omit<PayBand, 'id' | 'name'>>) {
  const fields: Record<string, Types.Decimal128> = {};
  if (input.baseSalary !== undefined) fields.baseSalary = Types.Decimal128.fromString(input.baseSalary);
  if (input.taPerKmRate !== undefined) fields.taPerKmRate = Types.Decimal128.fromString(input.taPerKmRate);
  if (input.daAmount !== undefined) fields.daAmount = Types.Decimal128.fromString(input.daAmount);
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
