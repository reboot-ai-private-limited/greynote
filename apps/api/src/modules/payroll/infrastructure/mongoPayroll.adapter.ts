import { Types, type FilterQuery } from 'mongoose';
import type { PayrollAdjustment, PayrollDraft, PayrollRun } from '../domain/payrollRun.entity.js';
import type { PayrollFilter, PayrollRunRepositoryPort, SaveDraftResult } from '../domain/payroll.repository.port.js';
import { PayrollRunModel, type PayrollRunDoc } from './payrollRun.schema.js';

const oid = (id: string) => new Types.ObjectId(id);
const isDuplicateKey = (err: unknown) => (err as { code?: number }).code === 11000;

const toRun = (d: PayrollRunDoc & { _id: unknown }): PayrollRun => ({
  id: String(d._id),
  userId: String(d.userId),
  month: d.month,
  baseSalaryPaise: d.baseSalaryPaise,
  ctcAnnualPaise: d.ctcAnnualPaise ?? null,
  ctcEffectiveFrom: d.ctcEffectiveFrom ?? null,
  ctcLines: (d.ctcLines ?? []).map((l) => ({ code: l.code, name: l.name, kind: l.kind, amountPaise: l.amountPaise, isOverridden: l.isOverridden })),
  totalTaDaPaise: d.totalTaDaPaise,
  reimbursementPaise: d.reimbursementPaise,
  esiNumber: d.esiNumber ?? null,
  epfNumber: d.epfNumber ?? null,
  designationName: d.designationName ?? null,
  bankName: d.bankName ?? null,
  bankAccountNumber: d.bankAccountNumber ?? null,
  dateOfJoining: d.dateOfJoining ?? null,
  deductionLines: (d.deductionLines ?? []).map((x) => ({ code: x.code, name: x.name, amountPaise: x.amountPaise })),
  statutoryDeductionPaise: d.statutoryDeductionPaise ?? 0,
  roundingPaise: d.roundingPaise ?? 0,
  unpaidLeaveDays: d.unpaidLeaveDays,
  leaveDeductionPaise: d.leaveDeductionPaise,
  absentDays: d.absentDays ?? 0,
  absentDeductionPaise: d.absentDeductionPaise ?? 0,
  netPayablePaise: d.netPayablePaise,
  days: (d.days ?? []).map((x) => ({ date: x.date, status: x.status, deductedDays: x.deductedDays, leaveType: x.leaveType ?? null })),
  adjustments: (d.adjustments ?? []).map((x) => ({ id: x.id, kind: x.kind, date: x.date ?? null, ruleDays: x.ruleDays ?? null, setDays: x.setDays ?? null, amountPaise: x.amountPaise, reason: x.reason, by: String(x.by), byRole: x.byRole, at: x.at })),
  adjustmentPaise: d.adjustmentPaise ?? 0,
  originalNetPayablePaise: d.originalNetPayablePaise ?? d.netPayablePaise,
  joinedInMonth: d.joinedInMonth,
  leftInMonth: d.leftInMonth ?? false,
  status: d.status,
  generatedBy: String(d.generatedBy),
  generatedAt: d.generatedAt,
  finalizedAt: d.finalizedAt,
  finalizedBy: d.finalizedBy ? String(d.finalizedBy) : null,
  paidAt: d.paidAt ?? null,
  paidBy: d.paidBy ? String(d.paidBy) : null,
  paymentReference: d.paymentReference ?? null,
});

export class MongoPayrollAdapter implements PayrollRunRepositoryPort {
  async saveDraft(draft: PayrollDraft): Promise<SaveDraftResult> {
    const fields = { ...draft, userId: oid(draft.userId), generatedBy: oid(draft.generatedBy), adjustments: draft.adjustments.map((x) => ({ ...x, by: oid(x.by) })) };
    // The overwrite is conditional on the row still being DRAFT: a finalize that commits first is never overwritten.
    const overwrite = () => PayrollRunModel.findOneAndUpdate({ userId: fields.userId, month: draft.month, status: 'DRAFT' }, { $set: fields }, { new: true, runValidators: true }).lean();

    const existing = await overwrite();
    if (existing) return { outcome: 'updated', run: toRun(existing) };
    try {
      const created = await PayrollRunModel.create({ ...fields, status: 'DRAFT', finalizedAt: null });
      return { outcome: 'created', run: toRun(created.toObject()) };
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      // A row exists: a draft another call just made (overwrite it), or a finalized one (leave it).
      const raced = await overwrite();
      return raced ? { outcome: 'updated', run: toRun(raced) } : { outcome: 'finalized' };
    }
  }

  async findById(id: string): Promise<PayrollRun | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await PayrollRunModel.findById(id).lean();
    return doc ? toRun(doc) : null;
  }

  async list(filter: PayrollFilter, limit: number): Promise<PayrollRun[]> {
    const q: FilterQuery<PayrollRunDoc> = {};
    const months: Record<string, string> = {};
    if (filter.fromMonth) months.$gte = filter.fromMonth;
    if (filter.toMonth) months.$lte = filter.toMonth;
    if (filter.month) months.$eq = filter.month;
    if (Object.keys(months).length > 0) q.month = months;
    if (filter.userId) q.userId = oid(filter.userId);
    if (filter.status) q.status = filter.status;
    return (await PayrollRunModel.find(q).sort({ month: -1, _id: 1 }).limit(limit).lean()).map(toRun);
  }

  async isFinalized(userId: string, month: string): Promise<boolean> {
    return (await PayrollRunModel.exists({ userId: oid(userId), month, status: 'FINALIZED' })) !== null;
  }

  async findByUserMonth(userId: string, month: string): Promise<PayrollRun | null> {
    const doc = await PayrollRunModel.findOne({ userId: oid(userId), month }).lean();
    return doc ? toRun(doc) : null;
  }

  async finalize(id: string, at: Date, by: string): Promise<boolean> {
    const res = await PayrollRunModel.updateOne({ _id: oid(id), status: 'DRAFT' }, { $set: { status: 'FINALIZED', finalizedAt: at, finalizedBy: oid(by) } });
    return res.modifiedCount === 1;
  }

  async saveAdjustments(id: string, expectedCount: number, next: { adjustments: PayrollAdjustment[]; adjustmentPaise: number; netPayablePaise: number; originalNetPayablePaise: number }): Promise<boolean> {
    const res = await PayrollRunModel.updateOne(
      { _id: oid(id), status: 'DRAFT', $expr: { $eq: [{ $size: { $ifNull: ['$adjustments', []] } }, expectedCount] } },
      { $set: { adjustments: next.adjustments.map((x) => ({ ...x, by: oid(x.by) })), adjustmentPaise: next.adjustmentPaise, netPayablePaise: next.netPayablePaise, originalNetPayablePaise: next.originalNetPayablePaise } },
    );
    return res.modifiedCount === 1;
  }

  async markPaid(id: string, by: string, at: Date, reference: string | null): Promise<boolean> {
    const res = await PayrollRunModel.updateOne({ _id: oid(id), status: 'FINALIZED', paidAt: null }, { $set: { paidAt: at, paidBy: oid(by), paymentReference: reference } });
    return res.modifiedCount === 1;
  }
}
