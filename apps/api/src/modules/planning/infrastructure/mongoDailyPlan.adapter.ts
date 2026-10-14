import { Types, type ClientSession } from 'mongoose';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { DailyPlan, PlanAmendment } from '../domain/dailyPlan.entity.js';
import type { DailyPlanRepositoryPort } from '../domain/dailyPlan.repository.port.js';
import type { PlanDay, PlannedDoctor } from '../domain/plan.js';
import { DailyPlanModel, type DailyPlanDoc } from './dailyPlan.schema.js';
import { isDuplicateKey, toDayDoc, toPlanDay } from './planDoc.js';

function toPlan(doc: DailyPlanDoc & { _id: unknown }): DailyPlan {
  return {
    id: String(doc._id),
    userId: String(doc.userId),
    planDate: doc.planDate,
    ...toPlanDay(doc),
    source: doc.source ?? 'MANUAL',
    doctors: (doc.doctors ?? []).map((d) => ({ doctorId: String(d.doctorId), carriedFrom: d.carriedFrom ?? null })),
    amendments: (doc.amendments ?? []).map((a) => ({ by: String(a.by), at: a.at, reason: a.reason, previous: toPlanDay(a.previous) })),
    revision: doc.revision,
    lateResubmits: doc.lateResubmits ?? 0,
    updatedAt: doc.updatedAt,
  };
}

export class MongoDailyPlanAdapter implements DailyPlanRepositoryPort {
  async findById(id: string): Promise<DailyPlan | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await DailyPlanModel.findById(id).lean();
    return doc ? toPlan(doc) : null;
  }

  async findByUserAndDate(userId: string, planDate: string): Promise<DailyPlan | null> {
    const doc = await DailyPlanModel.findOne({ userId: new Types.ObjectId(userId), planDate }).lean();
    return doc ? toPlan(doc) : null;
  }

  async listForUser(userId: string, from: string, to: string): Promise<DailyPlan[]> {
    const docs = await DailyPlanModel.find({ userId: new Types.ObjectId(userId), planDate: { $gte: from, $lte: to } })
      .sort({ planDate: 1 })
      .lean();
    return docs.map(toPlan);
  }

  async save(userId: string, planDate: string, day: PlanDay, expectedRevision: number | null): Promise<DailyPlan | null> {
    const body = { ...toDayDoc(day), updatedAt: new Date() };
    if (expectedRevision === null) {
      try {
        const doc = await DailyPlanModel.create({ userId: new Types.ObjectId(userId), planDate, ...body, revision: 1, lateResubmits: 0 });
        return toPlan(doc.toObject());
      } catch (err) {
        // Another save created the day's plan first.
        if (isDuplicateKey(err)) return null;
        throw err;
      }
    }
    const doc = await DailyPlanModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId), planDate, revision: expectedRevision },
      { $set: body, $inc: { revision: 1 } },
      { new: true },
    ).lean();
    return doc ? toPlan(doc) : null;
  }

  async createInherited(userId: string, planDate: string, day: PlanDay, ctx: TransactionContext): Promise<boolean> {
    const result = await DailyPlanModel.updateOne(
      { userId: new Types.ObjectId(userId), planDate },
      { $setOnInsert: { ...toDayDoc(day), source: 'MONTHLY', amendments: [], revision: 1, lateResubmits: 0, updatedAt: new Date() } },
      { upsert: true, session: ctx as ClientSession },
    );
    return result.upsertedCount === 1;
  }

  async saveDoctors(id: string, expectedRevision: number, doctors: PlannedDoctor[]): Promise<DailyPlan | null> {
    const doc = await DailyPlanModel.findOneAndUpdate(
      { _id: id, revision: expectedRevision },
      {
        $set: { doctors: doctors.map((d) => ({ doctorId: new Types.ObjectId(d.doctorId), carriedFrom: d.carriedFrom })), updatedAt: new Date() },
        $inc: { revision: 1 },
      },
      { new: true },
    ).lean();
    return doc ? toPlan(doc) : null;
  }

  async saveManagerDay(id: string, expectedRevision: number, day: PlanDay, doctors: PlannedDoctor[]): Promise<DailyPlan | null> {
    const doc = await DailyPlanModel.findOneAndUpdate(
      { _id: id, revision: expectedRevision },
      {
        $set: {
          ...toDayDoc(day),
          source: 'MANUAL',
          doctors: doctors.map((d) => ({ doctorId: new Types.ObjectId(d.doctorId), carriedFrom: d.carriedFrom })),
          updatedAt: new Date(),
        },
        $inc: { revision: 1 },
      },
      { new: true },
    ).lean();
    return doc ? toPlan(doc) : null;
  }

  async amend(id: string, expectedRevision: number, day: PlanDay, amendment: PlanAmendment): Promise<DailyPlan | null> {
    const doc = await DailyPlanModel.findOneAndUpdate(
      { _id: id, revision: expectedRevision },
      {
        $set: { ...toDayDoc(day), updatedAt: amendment.at },
        $push: { amendments: { by: new Types.ObjectId(amendment.by), at: amendment.at, reason: amendment.reason, previous: toDayDoc(amendment.previous) } },
        $inc: { revision: 1 },
      },
      { new: true },
    ).lean();
    return doc ? toPlan(doc) : null;
  }

  async applyChange(id: string, revision: number, day: PlanDay, ctx: TransactionContext): Promise<boolean> {
    const result = await DailyPlanModel.updateOne(
      { _id: id, revision },
      { $set: { ...toDayDoc(day), updatedAt: new Date() }, $inc: { revision: 1 } },
      { session: ctx as ClientSession },
    );
    return result.matchedCount === 1;
  }

  async confirmRevision(id: string, revision: number, countLateResubmit: boolean, ctx: TransactionContext): Promise<boolean> {
    const result = await DailyPlanModel.updateOne(
      { _id: id, revision },
      { $inc: { revision: 1, ...(countLateResubmit && { lateResubmits: 1 }) } },
      { session: ctx as ClientSession },
    );
    return result.matchedCount === 1;
  }
}
