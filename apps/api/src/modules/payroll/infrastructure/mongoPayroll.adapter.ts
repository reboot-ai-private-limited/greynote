import { Types, type FilterQuery } from 'mongoose';
import type { PayrollDraft, PayrollRun } from '../domain/payrollRun.entity.js';
import type { PayrollFilter, PayrollRunRepositoryPort, SaveDraftResult } from '../domain/payroll.repository.port.js';
import { PayrollRunModel, type PayrollRunDoc } from './payrollRun.schema.js';

const oid = (id: string) => new Types.ObjectId(id);
const isDuplicateKey = (err: unknown) => (err as { code?: number }).code === 11000;

const toRun = (d: PayrollRunDoc & { _id: unknown }): PayrollRun => ({
  id: String(d._id),
  userId: String(d.userId),
  month: d.month,
  baseSalaryPaise: d.baseSalaryPaise,
  totalTaDaPaise: d.totalTaDaPaise,
  reimbursementPaise: d.reimbursementPaise,
  unpaidLeaveDays: d.unpaidLeaveDays,
  leaveDeductionPaise: d.leaveDeductionPaise,
  netPayablePaise: d.netPayablePaise,
  joinedInMonth: d.joinedInMonth,
  status: d.status,
  generatedBy: String(d.generatedBy),
  generatedAt: d.generatedAt,
  finalizedAt: d.finalizedAt,
});

export class MongoPayrollAdapter implements PayrollRunRepositoryPort {
  async saveDraft(draft: PayrollDraft): Promise<SaveDraftResult> {
    const fields = { ...draft, userId: oid(draft.userId), generatedBy: oid(draft.generatedBy) };
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

  async finalize(id: string, at: Date): Promise<boolean> {
    const res = await PayrollRunModel.updateOne({ _id: oid(id), status: 'DRAFT' }, { $set: { status: 'FINALIZED', finalizedAt: at } });
    return res.modifiedCount === 1;
  }
}
