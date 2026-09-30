import { Types, type ClientSession } from 'mongoose';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { ChemistCall, DoctorCall, Followup, GeofenceOutcome } from '../domain/call.entity.js';
import type { Expense } from '../domain/expense.entity.js';
import type { GeofenceOverride } from '../domain/records.repository.port.js';
import type { ChemistCallRepositoryPort, DoctorCallRepositoryPort, ExpenseRepositoryPort, FollowupRepositoryPort } from '../domain/records.repository.port.js';
import { ChemistCallModel, DoctorCallModel, ExpenseModel, FollowupModel, type ChemistCallDoc, type DoctorCallDoc, type ExpenseDoc, type FollowupDoc } from './records.schema.js';

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
  workWith: d.workWith.map(String),
  remarks: d.remarks,
  capturedLocation: d.capturedLatitude === null || d.capturedLongitude === null ? null : { latitude: d.capturedLatitude, longitude: d.capturedLongitude },
  accuracyMeters: d.accuracyMeters,
  geofence: toGeofence(d),
  clientId: d.clientId,
  recordedAt: d.recordedAt,
});

/** Domain → columns for the fields every call shares. */
const callColumns = (c: Omit<DoctorCall, 'id' | 'doctorId' | 'samples'> | Omit<ChemistCall, 'id' | 'chemistId'>) => ({
  dcrId: oid(c.dcrId),
  userId: oid(c.userId),
  reportDate: c.reportDate,
  workingType: c.workingType,
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
  samples: d.samples.map((s) => ({ allocationId: String(s.allocationId), productId: String(s.productId), quantity: s.quantity })),
});
const toChemistCall = (d: ChemistCallDoc & { _id: unknown }): ChemistCall => ({ ...callBase(d), chemistId: String(d.chemistId) });
const toFollowup = (d: FollowupDoc & { _id: unknown }): Followup => ({
  id: String(d._id),
  dcrId: String(d.dcrId),
  userId: String(d.userId),
  reportDate: d.reportDate,
  subject: d.subject,
  subjectId: String(d.subjectId),
  remarks: d.remarks,
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

export class MongoDoctorCallAdapter implements DoctorCallRepositoryPort {
  async create(input: Omit<DoctorCall, 'id'>, ctx: TransactionContext): Promise<DoctorCall> {
    const [doc] = await DoctorCallModel.create(
      [{ ...callColumns(input), doctorId: oid(input.doctorId), samples: input.samples.map((s) => ({ allocationId: oid(s.allocationId), productId: oid(s.productId), quantity: s.quantity })) }],
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
  async create(input: Omit<ChemistCall, 'id'>, ctx: TransactionContext): Promise<ChemistCall> {
    const [doc] = await ChemistCallModel.create([{ ...callColumns(input), chemistId: oid(input.chemistId) }], session(ctx));
    return toChemistCall(doc!.toObject());
  }
  async countForDcrs(dcrIds: string[]): Promise<Map<string, number>> {
    return countByDcr(ChemistCallModel as never, dcrIds);
  }
  async listForDcr(dcrId: string): Promise<ChemistCall[]> {
    return (await ChemistCallModel.find({ dcrId: oid(dcrId) }).sort({ recordedAt: 1, _id: 1 }).lean()).map(toChemistCall);
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
  async create(input: Omit<Followup, 'id'>, ctx: TransactionContext): Promise<Followup> {
    const [doc] = await FollowupModel.create([{ ...input, dcrId: oid(input.dcrId), userId: oid(input.userId), subjectId: oid(input.subjectId) }], session(ctx));
    return toFollowup(doc!.toObject());
  }
  async countForDcrs(dcrIds: string[]): Promise<Map<string, number>> {
    return countByDcr(FollowupModel as never, dcrIds);
  }
  async listForDcr(dcrId: string): Promise<Followup[]> {
    return (await FollowupModel.find({ dcrId: oid(dcrId) }).sort({ recordedAt: 1, _id: 1 }).lean()).map(toFollowup);
  }
}

const toExpense = (d: ExpenseDoc & { _id: unknown }): Expense => ({
  id: String(d._id),
  dcrId: String(d.dcrId),
  userId: String(d.userId),
  reportDate: d.reportDate,
  routeId: d.routeId ? String(d.routeId) : null,
  type: d.type,
  source: d.source,
  amountPaise: d.amountPaise,
  remarks: d.remarks,
  paymentStatus: d.paymentStatus,
  accepted: d.accepted,
  distanceFlag: d.distanceFlag,
  paidBy: d.paidBy ? String(d.paidBy) : null,
  paidAt: d.paidAt,
  clientId: d.clientId,
  recordedAt: d.recordedAt,
});

export class MongoExpenseAdapter implements ExpenseRepositoryPort {
  async create(input: Omit<Expense, 'id'>, ctx: TransactionContext): Promise<Expense> {
    const [doc] = await ExpenseModel.create(
      [{ ...input, dcrId: oid(input.dcrId), userId: oid(input.userId), routeId: input.routeId ? oid(input.routeId) : null, paidBy: input.paidBy ? oid(input.paidBy) : null }],
      session(ctx),
    );
    return toExpense(doc!.toObject());
  }
  async setAccepted(dcrId: string, accepted: boolean, ctx: TransactionContext): Promise<void> {
    await ExpenseModel.updateMany({ dcrId: oid(dcrId), paymentStatus: { $ne: 'PAID' } }, { $set: { accepted } }, session(ctx));
  }
  async findById(id: string): Promise<Expense | null> {
    const doc = await ExpenseModel.findById(id).lean();
    return doc ? toExpense(doc) : null;
  }
  async markPaid(id: string, by: string, at: Date): Promise<boolean> {
    const res = await ExpenseModel.updateOne({ _id: oid(id), accepted: true, paymentStatus: 'UNPAID' }, { $set: { paymentStatus: 'PAID', paidBy: oid(by), paidAt: at } });
    return res.modifiedCount === 1;
  }
  async listAccepted(filter: { from: string; to: string; userId?: string; paymentStatus?: 'UNPAID' | 'PAID' }, limit: number): Promise<Expense[]> {
    const base = { accepted: true, reportDate: { $gte: filter.from, $lte: filter.to }, ...(filter.userId && { userId: oid(filter.userId) }) };
    const fetch = async (status: 'UNPAID' | 'PAID', n: number) => (await ExpenseModel.find({ ...base, paymentStatus: status }).sort({ reportDate: 1, _id: 1 }).limit(n).lean()).map(toExpense);
    if (filter.paymentStatus) return fetch(filter.paymentStatus, limit);
    const unpaid = await fetch('UNPAID', limit);
    return unpaid.length >= limit ? unpaid : [...unpaid, ...(await fetch('PAID', limit - unpaid.length))];
  }
  async paidTotals(userId: string, period: { from: Date; to: Date }): Promise<{ taPaise: number; daPaise: number; reimbursementPaise: number }> {
    const rows = await ExpenseModel.aggregate<{ _id: string; total: number }>([
      { $match: { userId: oid(userId), paymentStatus: 'PAID', paidAt: { $gte: period.from, $lt: period.to } } },
      { $group: { _id: '$type', total: { $sum: '$amountPaise' } } },
    ]);
    const of = (t: string) => rows.find((r) => r._id === t)?.total ?? 0;
    return { taPaise: of('TA'), daPaise: of('DA'), reimbursementPaise: of('TRAVEL') + of('MEAL') + of('MISC') };
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
