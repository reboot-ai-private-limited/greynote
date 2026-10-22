import { Types, type ClientSession } from 'mongoose';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { ChemistCall, DoctorCall, Followup, GeofenceOutcome } from '../domain/call.entity.js';
import type { Expense, ExpenseAttachment } from '../domain/expense.entity.js';
import type { GeofenceOverride } from '../domain/records.repository.port.js';
import type { ChemistCallRepositoryPort, DoctorCallRepositoryPort, ExpenseBucket, ExpenseMonthRecord, ExpenseMonthRepositoryPort, ExpenseMonthClaimSummary, ExpenseMonthSummary, GeofenceCount, ExpenseRepositoryPort, ExpenseStatement, FollowupRepositoryPort } from '../domain/records.repository.port.js';
import { ChemistCallModel, DoctorCallModel, ExpenseModel, ExpenseMonthModel, FollowupModel, type ChemistCallDoc, type DoctorCallDoc, type ExpenseDoc, type ExpenseMonthDoc, type FollowupDoc } from './records.schema.js';

const oid = (id: string) => new Types.ObjectId(id);
const session = (ctx: TransactionContext) => ({ session: ctx as ClientSession });

type CallDocLike = DoctorCallDoc | ChemistCallDoc;

const toGeofence = (d: CallDocLike): GeofenceOutcome => ({
  status: d.geofenceStatus,
  distanceMeters: d.geofenceDistanceMeters,
  reason: d.geofenceReason as GeofenceOutcome['reason'],
  overriddenBy: d.geofenceOverriddenBy ? String(d.geofenceOverriddenBy) : null,
  overriddenAt: d.geofenceOverriddenAt,
  overrideComment: d.geofenceOverrideComment,
});

const callBase = (d: CallDocLike & { _id: unknown }) => ({
  id: String(d._id),
  dcrId: String(d.dcrId),
  userId: String(d.userId),
  reportDate: d.reportDate,
  workingType: d.workingType,
  routeId: d.routeId ? String(d.routeId) : null,
  routeType: d.routeType ?? null,
  workWith: d.workWith.map(String),
  remarks: d.remarks,
  capturedLocation: d.capturedLatitude === null || d.capturedLongitude === null ? null : { latitude: d.capturedLatitude, longitude: d.capturedLongitude },
  accuracyMeters: d.accuracyMeters,
  geofence: toGeofence(d),
  clientId: d.clientId,
  recordedAt: d.recordedAt,
});

/** Domain → columns for the fields every call shares. */
const callColumns = (c: Omit<DoctorCall, 'id' | 'doctorId' | 'samples' | 'notInPlan' | 'routeNotInPlan'> | Omit<ChemistCall, 'id' | 'chemistId' | 'routeNotInPlan'>) => ({
  dcrId: oid(c.dcrId),
  userId: oid(c.userId),
  reportDate: c.reportDate,
  workingType: c.workingType,
  routeId: c.routeId ? oid(c.routeId) : null,
  routeType: c.routeType,
  workWith: c.workWith.map(oid),
  remarks: c.remarks,
  capturedLatitude: c.capturedLocation?.latitude ?? null,
  capturedLongitude: c.capturedLocation?.longitude ?? null,
  accuracyMeters: c.accuracyMeters,
  geofenceStatus: c.geofence.status,
  geofenceDistanceMeters: c.geofence.distanceMeters,
  geofenceReason: c.geofence.reason,
  geofenceOverriddenBy: c.geofence.overriddenBy ? oid(c.geofence.overriddenBy) : null,
  geofenceOverriddenAt: c.geofence.overriddenAt,
  geofenceOverrideComment: c.geofence.overrideComment,
  clientId: c.clientId,
  recordedAt: c.recordedAt,
});

const toDoctorCall = (d: DoctorCallDoc & { _id: unknown }): DoctorCall => ({
  ...callBase(d),
  doctorId: String(d.doctorId),
  notInPlan: d.notInPlan ?? false,
  routeNotInPlan: d.routeNotInPlan ?? false,
  samples: d.samples.map((s) => ({ allocationId: String(s.allocationId), productId: String(s.productId), quantity: s.quantity })),
});
const toChemistCall = (d: ChemistCallDoc & { _id: unknown }): ChemistCall => ({ ...callBase(d), chemistId: String(d.chemistId), routeNotInPlan: d.routeNotInPlan ?? false });
const toFollowup = (d: FollowupDoc & { _id: unknown }): Followup => ({
  id: String(d._id),
  dcrId: String(d.dcrId),
  userId: String(d.userId),
  reportDate: d.reportDate,
  subject: d.subject,
  subjectId: String(d.subjectId),
  remarks: d.remarks,
  workingType: d.workingType ?? null,
  routeId: d.routeId ? String(d.routeId) : null,
  routeType: d.routeType ?? null,
  notInPlan: d.notInPlan ?? false,
  capturedLocation: d.capturedLatitude == null || d.capturedLongitude == null ? null : { latitude: d.capturedLatitude, longitude: d.capturedLongitude },
  accuracyMeters: d.accuracyMeters ?? null,
  geofence: d.geofenceStatus ? { status: d.geofenceStatus, distanceMeters: d.geofenceDistanceMeters ?? null, reason: (d.geofenceReason ?? null) as GeofenceOutcome['reason'], overriddenBy: null, overriddenAt: null, overrideComment: null } : null,
  clientId: d.clientId,
  recordedAt: d.recordedAt,
});

/** Filter + update for the one-way `FAIL` / `UNVERIFIED` → `OVERRIDE`; the computed distance and reason stay. */
const overrideUpdate = (id: string, o: GeofenceOverride) => ({
  filter: { _id: oid(id), geofenceStatus: { $in: ['FAIL', 'UNVERIFIED'] } },
  update: { $set: { geofenceStatus: 'OVERRIDE', geofenceOverriddenBy: oid(o.by), geofenceOverriddenAt: o.at, geofenceOverrideComment: o.comment } },
});

/** Documents per DCR, for the reports — one aggregation, never a query per DCR. */
async function countByDcr(model: { aggregate: (p: object[]) => Promise<Array<{ _id: Types.ObjectId; n: number }>> }, dcrIds: string[]): Promise<Map<string, number>> {
  if (dcrIds.length === 0) return new Map();
  const rows = await model.aggregate([{ $match: { dcrId: { $in: dcrIds.map(oid) } } }, { $group: { _id: '$dcrId', n: { $sum: 1 } } }]);
  return new Map(rows.map((r) => [String(r._id), r.n]));
}

/** Documents matching a flag, per DCR, for report days in the range. */
const countFlagged = async (model: { aggregate: (p: object[]) => Promise<Array<{ _id: unknown; count: number }>> }, flag: string, range: { from: string; to: string }): Promise<Array<{ dcrId: string; count: number }>> => {
  const rows = await model.aggregate([{ $match: { reportDate: { $gte: range.from, $lte: range.to }, [flag]: true } }, { $group: { _id: '$dcrId', count: { $sum: 1 } } }]);
  return rows.map((r) => ({ dcrId: String(r._id), count: r.count }));
};

const countByGeofence = async (model: typeof DoctorCallModel | typeof ChemistCallModel, range: { from: string; to: string }): Promise<GeofenceCount[]> => {
  const rows = await (model as typeof DoctorCallModel).aggregate<{ _id: { dcrId: unknown; status: GeofenceCount['status'] }; count: number }>([
    { $match: { reportDate: { $gte: range.from, $lte: range.to } } },
    { $group: { _id: { dcrId: '$dcrId', status: '$geofenceStatus' }, count: { $sum: 1 } } },
  ]);
  return rows.map((r) => ({ dcrId: String(r._id.dcrId), status: r._id.status, count: r.count }));
};

export class MongoDoctorCallAdapter implements DoctorCallRepositoryPort {
  async listVisitDates(userId: string, doctorId: string, range: { from: string; to: string }, ctx?: TransactionContext): Promise<string[]> {
    const q = DoctorCallModel.distinct('reportDate', { userId: oid(userId), doctorId: oid(doctorId), reportDate: { $gte: range.from, $lte: range.to } });
    return (await (ctx ? q.session(ctx as ClientSession) : q)) as string[];
  }
  async countNotInPlan(range: { from: string; to: string }): Promise<Array<{ dcrId: string; count: number }>> {
    const rows = await DoctorCallModel.aggregate<{ _id: unknown; count: number }>([
      { $match: { reportDate: { $gte: range.from, $lte: range.to }, notInPlan: true } },
      { $group: { _id: '$dcrId', count: { $sum: 1 } } },
    ]);
    return rows.map((r) => ({ dcrId: String(r._id), count: r.count }));
  }
  countByGeofence(range: { from: string; to: string }): Promise<GeofenceCount[]> {
    return countByGeofence(DoctorCallModel, range);
  }
  countRouteNotInPlan(range: { from: string; to: string }): Promise<Array<{ dcrId: string; count: number }>> {
    return countFlagged(DoctorCallModel as never, 'routeNotInPlan', range);
  }
  async distinctDoctorIds(dcrIds: string[]): Promise<string[]> {
    if (dcrIds.length === 0) return [];
    return (await DoctorCallModel.distinct('doctorId', { dcrId: { $in: dcrIds.map(oid) } })).map(String);
  }
  async countByDoctor(dcrIds: string[]): Promise<Array<{ doctorId: string; count: number }>> {
    if (dcrIds.length === 0) return [];
    const rows = await DoctorCallModel.aggregate<{ _id: unknown; count: number }>([
      { $match: { dcrId: { $in: dcrIds.map(oid) } } },
      { $group: { _id: '$doctorId', count: { $sum: 1 } } },
    ]);
    return rows.map((r) => ({ doctorId: String(r._id), count: r.count }));
  }
  async create(input: Omit<DoctorCall, 'id'>, ctx: TransactionContext): Promise<DoctorCall> {
    const [doc] = await DoctorCallModel.create(
      [{ ...callColumns(input), doctorId: oid(input.doctorId), notInPlan: input.notInPlan, routeNotInPlan: input.routeNotInPlan, samples: input.samples.map((s) => ({ allocationId: oid(s.allocationId), productId: oid(s.productId), quantity: s.quantity })) }],
      session(ctx),
    );
    return toDoctorCall(doc!.toObject());
  }
  async countForDcrs(dcrIds: string[]): Promise<Map<string, number>> {
    return countByDcr(DoctorCallModel as never, dcrIds);
  }
  async listForDcr(dcrId: string): Promise<DoctorCall[]> {
    return (await DoctorCallModel.find({ dcrId: oid(dcrId) }).sort({ recordedAt: 1, _id: 1 }).lean()).map(toDoctorCall);
  }
  async delete(id: string, ctx: TransactionContext): Promise<boolean> {
    return (await DoctorCallModel.deleteOne({ _id: oid(id) }, session(ctx))).deletedCount === 1;
  }
  async findById(id: string): Promise<DoctorCall | null> {
    const doc = await DoctorCallModel.findById(id).lean();
    return doc ? toDoctorCall(doc) : null;
  }
  async overrideGeofence(id: string, o: GeofenceOverride): Promise<boolean> {
    const { filter, update } = overrideUpdate(id, o);
    return (await DoctorCallModel.updateOne(filter, update)).modifiedCount === 1;
  }
}

export class MongoChemistCallAdapter implements ChemistCallRepositoryPort {
  countByGeofence(range: { from: string; to: string }): Promise<GeofenceCount[]> {
    return countByGeofence(ChemistCallModel, range);
  }
  countRouteNotInPlan(range: { from: string; to: string }): Promise<Array<{ dcrId: string; count: number }>> {
    return countFlagged(ChemistCallModel as never, 'routeNotInPlan', range);
  }
  async create(input: Omit<ChemistCall, 'id'>, ctx: TransactionContext): Promise<ChemistCall> {
    const [doc] = await ChemistCallModel.create([{ ...callColumns(input), chemistId: oid(input.chemistId), routeNotInPlan: input.routeNotInPlan }], session(ctx));
    return toChemistCall(doc!.toObject());
  }
  async countForDcrs(dcrIds: string[]): Promise<Map<string, number>> {
    return countByDcr(ChemistCallModel as never, dcrIds);
  }
  async listForDcr(dcrId: string): Promise<ChemistCall[]> {
    return (await ChemistCallModel.find({ dcrId: oid(dcrId) }).sort({ recordedAt: 1, _id: 1 }).lean()).map(toChemistCall);
  }
  async delete(id: string, ctx: TransactionContext): Promise<boolean> {
    return (await ChemistCallModel.deleteOne({ _id: oid(id) }, session(ctx))).deletedCount === 1;
  }
  async findById(id: string): Promise<ChemistCall | null> {
    const doc = await ChemistCallModel.findById(id).lean();
    return doc ? toChemistCall(doc) : null;
  }
  async overrideGeofence(id: string, o: GeofenceOverride): Promise<boolean> {
    const { filter, update } = overrideUpdate(id, o);
    return (await ChemistCallModel.updateOne(filter, update)).modifiedCount === 1;
  }
}

export class MongoFollowupAdapter implements FollowupRepositoryPort {
  async listDoctorVisitDates(userId: string, doctorId: string, range: { from: string; to: string }, ctx?: TransactionContext): Promise<string[]> {
    const q = FollowupModel.distinct('reportDate', { userId: oid(userId), subject: 'DOCTOR', subjectId: oid(doctorId), reportDate: { $gte: range.from, $lte: range.to } });
    return (await (ctx ? q.session(ctx as ClientSession) : q)) as string[];
  }
  countNotInPlan(range: { from: string; to: string }): Promise<Array<{ dcrId: string; count: number }>> {
    return countFlagged(FollowupModel as never, 'notInPlan', range);
  }
  async countByDcrRange(range: { from: string; to: string }): Promise<Array<{ dcrId: string; count: number }>> {
    const rows = await FollowupModel.aggregate<{ _id: unknown; count: number }>([{ $match: { reportDate: { $gte: range.from, $lte: range.to } } }, { $group: { _id: '$dcrId', count: { $sum: 1 } } }]);
    return rows.map((r) => ({ dcrId: String(r._id), count: r.count }));
  }
  async create(input: Omit<Followup, 'id'>, ctx: TransactionContext): Promise<Followup> {
    const [doc] = await FollowupModel.create([
        {
          dcrId: oid(input.dcrId),
          userId: oid(input.userId),
          reportDate: input.reportDate,
          subject: input.subject,
          subjectId: oid(input.subjectId),
          remarks: input.remarks,
          workingType: input.workingType,
          routeId: input.routeId ? oid(input.routeId) : null,
          routeType: input.routeType,
          notInPlan: input.notInPlan,
          capturedLatitude: input.capturedLocation?.latitude ?? null,
          capturedLongitude: input.capturedLocation?.longitude ?? null,
          accuracyMeters: input.accuracyMeters,
          geofenceStatus: input.geofence?.status,
          geofenceDistanceMeters: input.geofence?.distanceMeters ?? null,
          geofenceReason: input.geofence?.reason ?? null,
          clientId: input.clientId,
          recordedAt: input.recordedAt,
        },
      ], session(ctx));
    return toFollowup(doc!.toObject());
  }
  async countForDcrs(dcrIds: string[]): Promise<Map<string, number>> {
    return countByDcr(FollowupModel as never, dcrIds);
  }
  async findById(id: string): Promise<Followup | null> {
    const doc = await FollowupModel.findById(id).lean();
    return doc ? toFollowup(doc) : null;
  }
  async delete(id: string, ctx: TransactionContext): Promise<boolean> {
    return (await FollowupModel.deleteOne({ _id: oid(id) }, session(ctx))).deletedCount === 1;
  }
  async listForDcr(dcrId: string): Promise<Followup[]> {
    return (await FollowupModel.find({ dcrId: oid(dcrId) }).sort({ recordedAt: 1, _id: 1 }).lean()).map(toFollowup);
  }
}

const toExpense = (d: ExpenseDoc & { _id: unknown }): Expense => ({
  id: String(d._id),
  dcrId: d.dcrId ? String(d.dcrId) : null,
  userId: String(d.userId),
  reportDate: d.reportDate,
  routeId: d.routeId ? String(d.routeId) : null,
  type: d.type,
  source: d.source,
  amountPaise: d.amountPaise,
  remarks: d.remarks,
  paymentStatus: d.paymentStatus,
  accepted: d.accepted,
  monthApproved: d.monthApproved,
  monthFinalized: d.monthFinalized ?? false,
  distanceFlag: d.distanceFlag,
  paidBy: d.paidBy ? String(d.paidBy) : null,
  paidAt: d.paidAt,
  clientId: d.clientId,
  recordedAt: d.recordedAt,
  originalAmountPaise: d.originalAmountPaise ?? null,
  attachments: (d.attachments ?? []).map((a) => ({ id: String(a._id), url: a.url, publicId: a.publicId, fileName: a.fileName, mimeType: a.mimeType, sizeBytes: a.sizeBytes, uploadedAt: a.uploadedAt })),
});

export class MongoExpenseAdapter implements ExpenseRepositoryPort {
  async create(input: Omit<Expense, 'id' | 'attachments'>, ctx: TransactionContext): Promise<Expense> {
    const [doc] = await ExpenseModel.create(
      [{ ...input, dcrId: input.dcrId ? oid(input.dcrId) : null, userId: oid(input.userId), routeId: input.routeId ? oid(input.routeId) : null, paidBy: input.paidBy ? oid(input.paidBy) : null }],
      session(ctx),
    );
    return toExpense(doc!.toObject());
  }
  async listForUserRange(userId: string, range: { from: string; to: string }): Promise<Expense[]> {
    return (await ExpenseModel.find({ userId: oid(userId), paymentStatus: { $ne: 'CANCELLED' }, reportDate: { $gte: range.from, $lte: range.to } }).sort({ reportDate: 1, _id: 1 }).lean()).map(toExpense);
  }
  async findOtherById(id: string, userId: string): Promise<Expense | null> {
    const doc = await ExpenseModel.findOne({ _id: oid(id), userId: oid(userId), type: 'OTHER' }).lean();
    return doc ? toExpense(doc) : null;
  }
  async updateOther(id: string, userId: string, patch: { reportDate: string; amountPaise: number; remarks: string | null }): Promise<boolean> {
    return (await ExpenseModel.updateOne({ _id: oid(id), userId: oid(userId), type: 'OTHER', paymentStatus: 'UNPAID', originalAmountPaise: null }, { $set: patch })).matchedCount === 1;
  }
  async addAttachment(id: string, userId: string, attachment: Omit<ExpenseAttachment, 'id'>, max: number): Promise<Expense | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await ExpenseModel.findOneAndUpdate(
      { _id: oid(id), userId: oid(userId), type: 'OTHER', paymentStatus: 'UNPAID', $expr: { $lt: [{ $size: { $ifNull: ['$attachments', []] } }, max] } },
      { $push: { attachments: { _id: new Types.ObjectId(), ...attachment } } },
      { new: true },
    ).lean();
    return doc ? toExpense(doc) : null;
  }
  async removeAttachment(id: string, userId: string, attachmentId: string): Promise<ExpenseAttachment | null> {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(attachmentId)) return null;
    const before = await ExpenseModel.findOneAndUpdate(
      { _id: oid(id), userId: oid(userId), type: 'OTHER', paymentStatus: 'UNPAID', 'attachments._id': new Types.ObjectId(attachmentId) },
      { $pull: { attachments: { _id: new Types.ObjectId(attachmentId) } } },
      { new: false },
    ).lean();
    return before ? (toExpense(before).attachments.find((a) => a.id === attachmentId) ?? null) : null;
  }
  async deleteOther(id: string, userId: string): Promise<boolean> {
    return (await ExpenseModel.deleteOne({ _id: oid(id), userId: oid(userId), type: 'OTHER', paymentStatus: 'UNPAID', originalAmountPaise: null })).deletedCount === 1;
  }
  async setMonthApproved(userId: string, range: { from: string; to: string }, approved: boolean, ctx: TransactionContext): Promise<void> {
    const base = { userId: oid(userId), paymentStatus: 'UNPAID', reportDate: { $gte: range.from, $lte: range.to } };
    await ExpenseModel.updateMany(base, { $set: { monthApproved: approved } }, session(ctx));
    await ExpenseModel.updateMany({ ...base, type: 'OTHER' }, { $set: { accepted: approved } }, session(ctx));
  }
  async setMonthFinalized(userId: string, range: { from: string; to: string }, ctx: TransactionContext): Promise<void> {
    await ExpenseModel.updateMany({ userId: oid(userId), paymentStatus: { $ne: 'CANCELLED' }, reportDate: { $gte: range.from, $lte: range.to } }, { $set: { monthFinalized: true } }, session(ctx));
  }
  async setAccepted(dcrId: string, accepted: boolean, ctx: TransactionContext): Promise<void> {
    await ExpenseModel.updateMany({ dcrId: oid(dcrId), paymentStatus: { $ne: 'PAID' } }, { $set: { accepted } }, session(ctx));
  }
  async findById(id: string): Promise<Expense | null> {
    const doc = await ExpenseModel.findById(id).lean();
    return doc ? toExpense(doc) : null;
  }
  async adjustAmount(id: string, expectedPaise: number, toPaise: number, originalPaise: number, ctx: TransactionContext): Promise<boolean> {
    const res = await ExpenseModel.updateOne({ _id: oid(id), paymentStatus: 'UNPAID', amountPaise: expectedPaise }, { $set: { amountPaise: toPaise, originalAmountPaise: originalPaise } }, session(ctx));
    return res.modifiedCount === 1;
  }
  async markPaid(id: string, by: string, at: Date): Promise<boolean> {
    const res = await ExpenseModel.updateOne({ _id: oid(id), accepted: true, monthApproved: true, monthFinalized: true, paymentStatus: 'UNPAID' }, { $set: { paymentStatus: 'PAID', paidBy: oid(by), paidAt: at } });
    return res.modifiedCount === 1;
  }
  async listAccepted(filter: { from: string; to: string; userId?: string; paymentStatus?: 'UNPAID' | 'PAID' }, limit: number): Promise<Expense[]> {
    const base = { accepted: true, reportDate: { $gte: filter.from, $lte: filter.to }, ...(filter.userId && { userId: oid(filter.userId) }) };
    const fetch = async (status: 'UNPAID' | 'PAID', n: number) => (await ExpenseModel.find({ ...base, paymentStatus: status }).sort({ reportDate: 1, _id: 1 }).limit(n).lean()).map(toExpense);
    if (filter.paymentStatus) return fetch(filter.paymentStatus, limit);
    const unpaid = await fetch('UNPAID', limit);
    return unpaid.length >= limit ? unpaid : [...unpaid, ...(await fetch('PAID', limit - unpaid.length))];
  }
  async summarizeClaimedByMonth(range: { from: string; to: string }): Promise<ExpenseMonthClaimSummary[]> {
    const rows = await ExpenseModel.aggregate<{ _id: { userId: unknown; month: string; status: 'UNPAID' | 'PAID'; type: string; accepted: boolean }; total: number; flagged: number }>([
      { $match: { paymentStatus: { $in: ['UNPAID', 'PAID'] }, reportDate: { $gte: range.from, $lte: range.to } } },
      { $group: { _id: { userId: '$userId', month: { $substrBytes: ['$reportDate', 0, 7] }, status: '$paymentStatus', type: '$type', accepted: '$accepted' }, total: { $sum: '$amountPaise' }, flagged: { $sum: { $cond: ['$distanceFlag', 1, 0] } } } },
    ]);
    const byKey = new Map<string, ExpenseMonthClaimSummary>();
    for (const r of rows) {
      const key = `${String(r._id.userId)}|${r._id.month}`;
      const s = byKey.get(key) ?? { userId: String(r._id.userId), month: r._id.month, taPaise: 0, daPaise: 0, reimbursementPaise: 0, paidPaise: 0, unpaidPaise: 0, flaggedRows: 0, acceptedPaise: 0 };
      if (r._id.type === 'TA') s.taPaise += r.total;
      else if (r._id.type === 'DA') s.daPaise += r.total;
      else s.reimbursementPaise += r.total;
      if (r._id.status === 'PAID') s.paidPaise += r.total;
      else s.unpaidPaise += r.total;
      if (r._id.accepted) s.acceptedPaise += r.total;
      s.flaggedRows += r.flagged;
      byKey.set(key, s);
    }
    return [...byKey.values()];
  }
  async summarizeByMonth(range: { from: string; to: string }): Promise<ExpenseMonthSummary[]> {
    const rows = await ExpenseModel.aggregate<{ _id: { userId: unknown; month: string; status: 'UNPAID' | 'PAID'; type: string }; total: number; flagged: number }>([
      { $match: { accepted: true, paymentStatus: { $in: ['UNPAID', 'PAID'] }, reportDate: { $gte: range.from, $lte: range.to } } },
      { $group: { _id: { userId: '$userId', month: { $substrBytes: ['$reportDate', 0, 7] }, status: '$paymentStatus', type: '$type' }, total: { $sum: '$amountPaise' }, flagged: { $sum: { $cond: ['$distanceFlag', 1, 0] } } } },
    ]);
    const byKey = new Map<string, ExpenseMonthSummary>();
    for (const r of rows) {
      const key = `${String(r._id.userId)}|${r._id.month}`;
      const s = byKey.get(key) ?? { userId: String(r._id.userId), month: r._id.month, taPaise: 0, daPaise: 0, reimbursementPaise: 0, paidPaise: 0, unpaidPaise: 0, flaggedRows: 0 };
      if (r._id.type === 'TA') s.taPaise += r.total;
      else if (r._id.type === 'DA') s.daPaise += r.total;
      else s.reimbursementPaise += r.total;
      if (r._id.status === 'PAID') s.paidPaise += r.total;
      else s.unpaidPaise += r.total;
      s.flaggedRows += r.flagged;
      byKey.set(key, s);
    }
    return [...byKey.values()];
  }
  async statementsForRange(range: { from: string; to: string }, options: { payableOnly?: boolean } = {}): Promise<ExpenseStatement[]> {
    const rows = await ExpenseModel.aggregate<{ _id: { userId: unknown; status: 'UNPAID' | 'PAID'; type: string }; total: number; count: number; lastPaidAt: Date | null }>([
      { $match: { accepted: true, ...(options.payableOnly && { monthApproved: true, monthFinalized: true }), paymentStatus: { $in: ['UNPAID', 'PAID'] }, reportDate: { $gte: range.from, $lte: range.to } } },
      { $group: { _id: { userId: '$userId', status: '$paymentStatus', type: '$type' }, total: { $sum: '$amountPaise' }, count: { $sum: 1 }, lastPaidAt: { $max: '$paidAt' } } },
    ]);
    const empty = (): ExpenseBucket => ({ taPaise: 0, daPaise: 0, reimbursementPaise: 0, count: 0 });
    const byUser = new Map<string, ExpenseStatement>();
    for (const r of rows) {
      const id = String(r._id.userId);
      const s = byUser.get(id) ?? { userId: id, unpaid: empty(), paid: empty(), lastPaidAt: null };
      const bucket = r._id.status === 'PAID' ? s.paid : s.unpaid;
      if (r._id.type === 'TA') bucket.taPaise += r.total;
      else if (r._id.type === 'DA') bucket.daPaise += r.total;
      else bucket.reimbursementPaise += r.total;
      bucket.count += r.count;
      if (r.lastPaidAt && (!s.lastPaidAt || r.lastPaidAt > s.lastPaidAt)) s.lastPaidAt = r.lastPaidAt;
      byUser.set(id, s);
    }
    return [...byUser.values()];
  }
  async payAllForUser(userId: string, range: { from: string; to: string }, by: string, at: Date): Promise<number> {
    const res = await ExpenseModel.updateMany(
      { userId: oid(userId), accepted: true, monthApproved: true, monthFinalized: true, paymentStatus: 'UNPAID', reportDate: { $gte: range.from, $lte: range.to } },
      { $set: { paymentStatus: 'PAID', paidBy: oid(by), paidAt: at } },
    );
    return res.modifiedCount;
  }
  async paidTotals(userId: string, period: { from: Date; to: Date }): Promise<{ taPaise: number; daPaise: number; reimbursementPaise: number }> {
    const rows = await ExpenseModel.aggregate<{ _id: string; total: number }>([
      { $match: { userId: oid(userId), paymentStatus: 'PAID', paidAt: { $gte: period.from, $lt: period.to } } },
      { $group: { _id: '$type', total: { $sum: '$amountPaise' } } },
    ]);
    const of = (t: string) => rows.find((r) => r._id === t)?.total ?? 0;
    return { taPaise: of('TA'), daPaise: of('DA'), reimbursementPaise: of('TRAVEL') + of('MEAL') + of('MISC') + of('OTHER') };
  }
  async totalsForDcrs(dcrIds: string[]): Promise<Map<string, { taPaise: number; daPaise: number; otherPaise: number; paidPaise: number }>> {
    const out = new Map<string, { taPaise: number; daPaise: number; otherPaise: number; paidPaise: number }>();
    if (dcrIds.length === 0) return out;
    const rows = await ExpenseModel.find({ dcrId: { $in: dcrIds.map(oid) }, paymentStatus: { $ne: 'CANCELLED' } }, { dcrId: 1, type: 1, amountPaise: 1, paymentStatus: 1 }).lean();
    for (const r of rows) {
      const t = out.get(String(r.dcrId)) ?? { taPaise: 0, daPaise: 0, otherPaise: 0, paidPaise: 0 };
      if (r.type === 'TA') t.taPaise += r.amountPaise;
      else if (r.type === 'DA') t.daPaise += r.amountPaise;
      else t.otherPaise += r.amountPaise;
      if (r.paymentStatus === 'PAID') t.paidPaise += r.amountPaise;
      out.set(String(r.dcrId), t);
    }
    return out;
  }
  async hasActiveAuto(dcrId: string, ctx: TransactionContext): Promise<boolean> {
    return (await ExpenseModel.exists({ dcrId: oid(dcrId), source: 'AUTO', paymentStatus: { $ne: 'CANCELLED' } }).session(ctx as ClientSession)) !== null;
  }
  async cancelUnpaidAuto(dcrId: string, ctx: TransactionContext): Promise<number> {
    const res = await ExpenseModel.updateMany({ dcrId: oid(dcrId), source: 'AUTO', paymentStatus: 'UNPAID' }, { $set: { paymentStatus: 'CANCELLED' } }, session(ctx));
    return res.modifiedCount;
  }
  async listForDcr(dcrId: string): Promise<Expense[]> {
    return (await ExpenseModel.find({ dcrId: oid(dcrId) }).sort({ recordedAt: 1, _id: 1 }).lean()).map(toExpense);
  }
}

const toExpenseMonth = (d: ExpenseMonthDoc & { _id: unknown }): ExpenseMonthRecord => ({ id: String(d._id), userId: String(d.userId), month: d.month, status: d.status, submittedAt: d.submittedAt, finalizedAt: d.finalizedAt ?? null, finalizedBy: d.finalizedBy ? String(d.finalizedBy) : null, taPaise: d.taPaise, daPaise: d.daPaise, otherPaise: d.otherPaise });

export class MongoExpenseMonthAdapter implements ExpenseMonthRepositoryPort {
  async find(userId: string, month: string): Promise<ExpenseMonthRecord | null> {
    const doc = await ExpenseMonthModel.findOne({ userId: oid(userId), month }).lean();
    return doc ? toExpenseMonth(doc) : null;
  }
  async findById(id: string): Promise<ExpenseMonthRecord | null> {
    const doc = await ExpenseMonthModel.findById(id).lean();
    return doc ? toExpenseMonth(doc) : null;
  }
  async markSubmitted(userId: string, month: string, totals: { taPaise: number; daPaise: number; otherPaise: number }, at: Date, ctx: TransactionContext): Promise<ExpenseMonthRecord> {
    const doc = await ExpenseMonthModel.findOneAndUpdate({ userId: oid(userId), month }, { $set: { status: 'SUBMITTED', submittedAt: at, ...totals } }, { upsert: true, new: true, ...session(ctx) }).lean();
    return toExpenseMonth(doc!);
  }
  async finalize(userId: string, month: string, by: string, at: Date, ctx: TransactionContext): Promise<boolean> {
    const res = await ExpenseMonthModel.updateOne({ userId: oid(userId), month, finalizedAt: null }, { $set: { finalizedAt: at, finalizedBy: oid(by) } }, session(ctx));
    return res.modifiedCount === 1;
  }
  async listForUsers(userIds: string[], month: string): Promise<ExpenseMonthRecord[]> {
    return (await ExpenseMonthModel.find({ userId: { $in: userIds.map(oid) }, month }).lean()).map(toExpenseMonth);
  }
}
