import { Schema, model, type Types } from 'mongoose';
import { PAY_BAND_NAMES, type PayBandName } from '../domain/payBand.entity.js';

interface PayBandDocument {
  name: PayBandName;
  baseSalary: Types.Decimal128;
  taPerKmRate: Types.Decimal128;
  daAmount: Types.Decimal128;
}

const payBandSchema = new Schema<PayBandDocument>({
  name: { type: String, required: true, unique: true, enum: PAY_BAND_NAMES },
  baseSalary: { type: Schema.Types.Decimal128, required: true },
  taPerKmRate: { type: Schema.Types.Decimal128, required: true },
  daAmount: { type: Schema.Types.Decimal128, required: true },
});

export const PayBandModel = model<PayBandDocument>('PayBand', payBandSchema);
