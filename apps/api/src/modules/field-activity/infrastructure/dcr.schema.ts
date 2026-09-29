import { Schema, model, type Types } from 'mongoose';

export interface DcrDoc {
  userId: Types.ObjectId;
  reportDate: string;
  createdAt: Date;
}

const dcrSchema = new Schema<DcrDoc>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  // A calendar day as `YYYY-MM-DD` — sorts as a string, and isn't an instant.
  reportDate: { type: String, required: true },
  createdAt: { type: Date, required: true },
});

// One DCR per user per day, enforced by the database; also serves "my DCRs between two dates".
dcrSchema.index({ userId: 1, reportDate: 1 }, { unique: true });

export const DcrModel = model<DcrDoc>('Dcr', dcrSchema);
