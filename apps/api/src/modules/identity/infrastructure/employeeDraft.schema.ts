import { Schema, model, type Types } from 'mongoose';

export interface EmployeeDraftDoc {
  createdBy: Types.ObjectId;
  step: number;
  /** Free-form on purpose: a draft may be saved half-filled, so the sections are validated when the request arrives and again when the employee is created. */
  data: Record<string, unknown>;
  createdUserId?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const employeeDraftSchema = new Schema<EmployeeDraftDoc>(
  {
    createdBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    step: { type: Number, required: true, default: 1 },
    data: { type: Schema.Types.Mixed, required: true, default: {} },
    createdUserId: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
  },
  { timestamps: true, minimize: false },
);

employeeDraftSchema.index({ updatedAt: -1 });

export const EmployeeDraftModel = model<EmployeeDraftDoc>('EmployeeDraft', employeeDraftSchema);
