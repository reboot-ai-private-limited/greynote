import { Schema, model } from 'mongoose';
import { isPaise } from '@/shared/money/paise.js';

interface PayBandDocument {
  name: string;
  /** Lower-cased, space-squashed `name`, for the case-insensitive unique index. */
  nameKey: string;
  taPerKmRatePaise: number;
  hqDaPaise: number;
  exStationDaPaise: number;
  outStationDaPaise: number;
}

/** Whole paise, checked by the schema as well as the API: a stray decimal or negative can't be stored. */
const paise = { type: Number, required: true, validate: { validator: isPaise, message: 'Must be a whole number of paise.' } };

const payBandSchema = new Schema<PayBandDocument>({
  name: { type: String, required: true },
  nameKey: { type: String, required: true, unique: true },
  taPerKmRatePaise: paise,
  hqDaPaise: paise,
  exStationDaPaise: paise,
  outStationDaPaise: paise,
});

export const PayBandModel = model<PayBandDocument>('PayBand', payBandSchema);
