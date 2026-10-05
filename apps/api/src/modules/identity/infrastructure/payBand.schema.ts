import { Schema, model } from 'mongoose';
import { isPaise } from '@/shared/money/paise.js';
import { PAY_BAND_NAMES, type PayBandName } from '../domain/payBand.entity.js';

interface PayBandDocument {
  name: PayBandName;
  baseSalaryPaise: number;
  suggestedCtcAnnualPaise: number | null;
  taPerKmRatePaise: number;
  hqDaPaise: number;
  exStationDaPaise: number;
  outStationDaPaise: number;
}

/** Whole paise, checked by the schema as well as the API: a stray decimal or negative can't be stored. */
const paise = { type: Number, required: true, validate: { validator: isPaise, message: 'Must be a whole number of paise.' } };

const payBandSchema = new Schema<PayBandDocument>({
  name: { type: String, required: true, unique: true, enum: PAY_BAND_NAMES },
  baseSalaryPaise: paise,
  suggestedCtcAnnualPaise: { type: Number, default: null, validate: { validator: (v: unknown) => v === null || isPaise(v), message: 'Must be a whole number of paise.' } },
  taPerKmRatePaise: paise,
  hqDaPaise: paise,
  exStationDaPaise: paise,
  outStationDaPaise: paise,
});

export const PayBandModel = model<PayBandDocument>('PayBand', payBandSchema);
