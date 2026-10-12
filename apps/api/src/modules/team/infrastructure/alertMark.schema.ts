import { Schema, model } from 'mongoose';

export interface AlertMarkDoc {
  key: string;
  createdAt: Date;
}

const alertMarkSchema = new Schema<AlertMarkDoc>({
  key: { type: String, required: true },
  createdAt: { type: Date, required: true },
});

alertMarkSchema.index({ key: 1 }, { unique: true });
// A mark only has to outlive the request it stands for; 90 days is far past any open request.
alertMarkSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const AlertMarkModel = model<AlertMarkDoc>('TeamAlertMark', alertMarkSchema);
