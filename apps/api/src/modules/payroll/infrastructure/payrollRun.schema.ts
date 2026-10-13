import { Schema, model, type Types } from 'mongoose';
import { isPaise } from '@/shared/money/paise.js';
import { PAYROLL_STATUSES, type PayrollStatus } from '../domain/payrollRun.entity.js';

export interface PayrollRunDoc {
  userId: Types.ObjectId;
  month: string;
  baseSalaryPaise: number;
  ctcAnnualPaise: number | null;
  ctcEffectiveFrom: string | null;
  ctcLines: Array<{ code: string; name: string; kind: 'EARNING' | 'EMPLOYER_CONTRIBUTION'; amountPaise: number; isOverridden: boolean }>;
  totalTaDaPaise: number;
  reimbursementPaise: number;
  esiNumber?: string | null;
  unpaidLeaveDays: number;
  leaveDeductionPaise: number;
  absentDays?: number;
  absentDeductionPaise?: number;
  netPayablePaise: number;
  days?: Array<{ date: string; status: string; deductedDays: number; leaveType: string | null }>;
  adjustments?: Array<{ id: string; kind: 'DAY' | 'AMOUNT'; date: string | null; ruleDays: number | null; setDays: number | null; amountPaise: number; reason: string; by: Types.ObjectId; byRole: string; at: Date }>;
  adjustmentPaise?: number;
  originalNetPayablePaise?: number;
  joinedInMonth: boolean;
  status: PayrollStatus;
  generatedBy: Types.ObjectId;
  generatedAt: Date;
  finalizedAt: Date | null;
  finalizedBy?: Types.ObjectId | null;
  paidAt?: Date | null;
  paidBy?: Types.ObjectId | null;
  paymentReference?: string | null;
}

const paise = { type: Number, required: true, min: 0, validate: { validator: isPaise, message: 'Must be a whole number of paise.' } };
const schema = new Schema<PayrollRunDoc>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  month: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
  baseSalaryPaise: paise,
  ctcAnnualPaise: { type: Number, default: null },
  ctcEffectiveFrom: { type: String, default: null },
  ctcLines: { type: [new Schema({ code: String, name: String, kind: String, amountPaise: Number, isOverridden: Boolean }, { _id: false })], default: [] },
  totalTaDaPaise: paise,
  reimbursementPaise: paise,
  esiNumber: { type: String, default: null },
  unpaidLeaveDays: { type: Number, required: true, min: 0, validate: { validator: (v: number) => Number.isInteger(v * 2), message: 'Whole or half days only.' } },
  leaveDeductionPaise: paise,
  absentDays: { type: Number, default: 0, min: 0, max: 30, validate: { validator: Number.isInteger, message: 'Whole days only.' } },
  absentDeductionPaise: { type: Number, default: 0, min: 0, validate: { validator: isPaise, message: 'Must be a whole number of paise.' } },
  netPayablePaise: paise,
  days: { type: [new Schema({ date: String, status: String, deductedDays: Number, leaveType: { type: String, default: null } }, { _id: false })], default: [] },
  adjustments: {
    type: [new Schema({ id: String, kind: { type: String, enum: ['DAY', 'AMOUNT'] }, date: { type: String, default: null }, ruleDays: { type: Number, default: null }, setDays: { type: Number, default: null }, amountPaise: Number, reason: String, by: { type: Schema.Types.ObjectId, ref: 'User' }, byRole: String, at: Date }, { _id: false })],
    default: [],
  },
  adjustmentPaise: { type: Number, default: 0 },
  originalNetPayablePaise: { type: Number, default: 0 },
  joinedInMonth: { type: Boolean, required: true },
  status: { type: String, required: true, enum: PAYROLL_STATUSES },
  generatedBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  generatedAt: { type: Date, required: true },
  finalizedAt: { type: Date, default: null },
  finalizedBy: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
  paidAt: { type: Date, default: null },
  paidBy: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
  paymentReference: { type: String, default: null },
});
// The sheet must add up, whatever wrote it.
schema.pre('validate', function () {
  if (this.baseSalaryPaise + this.totalTaDaPaise + this.reimbursementPaise - this.leaveDeductionPaise - (this.absentDeductionPaise ?? 0) + (this.adjustmentPaise ?? 0) !== this.netPayablePaise) this.invalidate('netPayablePaise', 'Net pay must equal base + TA/DA + reimbursement − leave deduction − absent deduction + adjustments.');
  if ((this.status === 'FINALIZED') !== (this.finalizedAt !== null)) this.invalidate('finalizedAt', 'A run is finalized exactly when it has a finalization time.');
});
schema.index({ userId: 1, month: 1 }, { unique: true });
schema.index({ month: 1, status: 1 });
export const PayrollRunModel = model<PayrollRunDoc>('PayrollRun', schema);
