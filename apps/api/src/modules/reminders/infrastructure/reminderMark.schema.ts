import { Schema, model } from 'mongoose';

export interface ReminderMarkDoc {
  key: string;
  createdAt: Date;
}

const reminderMarkSchema = new Schema<ReminderMarkDoc>({
  key: { type: String, required: true },
  createdAt: { type: Date, required: true },
});

reminderMarkSchema.index({ key: 1 }, { unique: true });
// A mark only has to outlive its reminder window (a day at most); 90 days keeps the history readable and far outlasts any period.
reminderMarkSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const ReminderMarkModel = model<ReminderMarkDoc>('ReminderMark', reminderMarkSchema);
