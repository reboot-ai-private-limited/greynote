import { Schema, model } from 'mongoose';
import type { PayComponentKind, PayComponentRule } from '../domain/payComponent.entity.js';

export interface PayComponentDocument {
  code: string;
  name: string;
  kind: PayComponentKind;
  rule: PayComponentRule;
  order: number;
  isActive: boolean;
  mandatory?: boolean;
}

const payComponentSchema = new Schema<PayComponentDocument>({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  kind: { type: String, required: true, enum: ['EARNING', 'DEDUCTION', 'EMPLOYER_CONTRIBUTION'] },
  // Shape depends on `rule.type`; the API's zod schema and `validatePayComponents` are what keep it valid.
  rule: { type: Schema.Types.Mixed, required: true },
  order: { type: Number, required: true },
  isActive: { type: Boolean, required: true, default: true },
  mandatory: { type: Boolean, default: false },
});

export const PayComponentModel = model<PayComponentDocument>('PayComponent', payComponentSchema);
