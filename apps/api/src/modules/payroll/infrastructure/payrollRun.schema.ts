import { Schema, model, type Types } from 'mongoose';
import { isPaise } from '@/shared/money/paise.js';
import { PAYROLL_STATUSES, type PayrollStatus } from '../domain/payrollRun.entity.js';

export interface PayrollRunDoc {
  userId: Types.ObjectId;
  month: string;
  baseSalaryPaise: number;
  totalTaDaPaise: number;
  reimbursementPaise: number;
  unpaidLeaveDays: number;
  leaveDeductionPaise: number;
  netPayablePaise: number;
  joinedInMonth: boolean;
  status: PayrollStatus;
  generatedBy: Types.ObjectId;
  generatedAt: Date;
  finalizedAt: Date | null;
}

const paise = { type: Number, required: true, min: 0, validate: { validator: isPaise, message: 'Must be a whole number of paise.' } };
const schema = new Schema<PayrollRunDoc>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  month: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
  baseSalaryPaise: paise,
  totalTaDaPaise: paise,
  reimbursementPaise: paise,
  unpaidLeaveDays: { type: Number, required: true, min: 0, validate: { validator: (v: number) => Number.isInteger(v * 2), message: 'Whole or half days only.' } },
  leaveDeductionPaise: paise,
  netPayablePaise: paise,
  joinedInMonth: { type: Boolean, required: true },
  status: { type: String, required: true, enum: PAYROLL_STATUSES },
  generatedBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  generatedAt: { type: Date, required: true },
  finalizedAt: { type: Date, default: null },
});
// The sheet must add up, whatever wrote it.
schema.pre('validate', function () {
  if (this.baseSalaryPaise + this.totalTaDaPaise + this.reimbursementPaise - this.leaveDeductionPaise !== this.netPayablePaise) this.invalidate('netPayablePaise', 'Net pay must equal base + TA/DA + reimbursement − leave deduction.');
  if ((this.status === 'FINALIZED') !== (this.finalizedAt !== null)) this.invalidate('finalizedAt', 'A run is finalized exactly when it has a finalization time.');
});
schema.index({ userId: 1, month: 1 }, { unique: true });
schema.index({ month: 1, status: 1 });
export const PayrollRunModel = model<PayrollRunDoc>('PayrollRun', schema);
