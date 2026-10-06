import { Types } from 'mongoose';
import { AppError } from '@/shared/errors/AppError.js';
import type { Promotion } from '../domain/promotion.entity.js';
import type { NewPromotion, PromotionRepositoryPort } from '../domain/promotion.repository.port.js';
import { PromotionModel, type PromotionDocument } from './promotion.schema.js';

const oidOrNull = (id: string | null): Types.ObjectId | null => (id === null ? null : new Types.ObjectId(id));
const idOrNull = (id: Types.ObjectId | null | undefined): string | null => (id === null || id === undefined ? null : String(id));

function toPromotion(doc: PromotionDocument & { _id: unknown }): Promotion {
  return {
    id: String(doc._id),
    userId: String(doc.userId),
    effectiveFrom: doc.effectiveFrom,
    status: doc.status,
    fromDesignationId: idOrNull(doc.fromDesignationId),
    toDesignationId: idOrNull(doc.toDesignationId),
    fromPayBandId: idOrNull(doc.fromPayBandId),
    toPayBandId: idOrNull(doc.toPayBandId),
    fromManagerId: idOrNull(doc.fromManagerId),
    toManagerId: idOrNull(doc.toManagerId),
    ctc: doc.ctc ? { ctcAnnualPaise: doc.ctc.ctcAnnualPaise, overrides: doc.ctc.overrides ?? {} } : null,
    teamMoves: doc.teamMoves.map((m) => ({ userId: String(m.userId), toManagerId: String(m.toManagerId) })),
    reason: doc.reason,
    createdBy: String(doc.createdBy),
    createdAt: doc.createdAt,
    ctcAssignmentId: idOrNull(doc.ctcAssignmentId),
    appliedAt: doc.appliedAt,
    cancelledAt: doc.cancelledAt,
    claimedAt: doc.claimedAt ?? null,
    note: doc.note ?? null,
    skippedMoves: (doc.skippedMoves ?? []).map((m) => ({ userId: String(m.userId), toManagerId: String(m.toManagerId) })),
    unplannedReportIds: (doc.unplannedReportIds ?? []).map(String),
  };
}

export class MongoPromotionAdapter implements PromotionRepositoryPort {
  async create(input: NewPromotion): Promise<Promotion> {
    try {
      const doc = await PromotionModel.create({
        userId: new Types.ObjectId(input.userId),
        effectiveFrom: input.effectiveFrom,
        fromDesignationId: oidOrNull(input.fromDesignationId),
        toDesignationId: oidOrNull(input.toDesignationId),
        fromPayBandId: oidOrNull(input.fromPayBandId),
        toPayBandId: oidOrNull(input.toPayBandId),
        fromManagerId: oidOrNull(input.fromManagerId),
        toManagerId: oidOrNull(input.toManagerId),
        ctc: input.ctc,
        teamMoves: input.teamMoves.map((m) => ({ userId: new Types.ObjectId(m.userId), toManagerId: new Types.ObjectId(m.toManagerId) })),
        reason: input.reason,
        createdBy: new Types.ObjectId(input.createdBy),
      });
      return toPromotion(doc.toObject());
    } catch (err) {
      if ((err as { code?: number }).code === 11000) throw AppError.conflict('This employee already has a promotion scheduled. Cancel it first.', { field: 'userId' });
      throw err;
    }
  }

  async findById(id: string): Promise<Promotion | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await PromotionModel.findById(id).lean();
    return doc ? toPromotion(doc) : null;
  }

  async listByUser(userId: string): Promise<Promotion[]> {
    const docs = await PromotionModel.find({ userId: new Types.ObjectId(userId) }).sort({ createdAt: -1 }).lean();
    return docs.map(toPromotion);
  }

  async findScheduledByUser(userId: string): Promise<Promotion | null> {
    const doc = await PromotionModel.findOne({ userId: new Types.ObjectId(userId), status: 'SCHEDULED' }).lean();
    return doc ? toPromotion(doc) : null;
  }

  async list(filter: { status?: Promotion['status'] | undefined }): Promise<Promotion[]> {
    const docs = await PromotionModel.find(filter.status ? { status: filter.status } : {}).sort({ createdAt: -1 }).limit(200).lean();
    return docs.map(toPromotion);
  }

  async claimDue(month: string, now: Date, leaseMs: number): Promise<Promotion | null> {
    const lapsed = new Date(now.getTime() - leaseMs);
    const doc = await PromotionModel.findOneAndUpdate(
      { status: 'SCHEDULED', effectiveFrom: { $lte: month }, $or: [{ claimedAt: null }, { claimedAt: { $lt: lapsed } }] },
      { $set: { claimedAt: now } },
      { sort: { effectiveFrom: 1, createdAt: 1 }, new: true },
    ).lean();
    return doc ? toPromotion(doc) : null;
  }

  async markCtcAssignment(id: string, ctcAssignmentId: string): Promise<void> {
    await PromotionModel.updateOne({ _id: id }, { $set: { ctcAssignmentId: new Types.ObjectId(ctcAssignmentId) } });
  }

  async markApplied(id: string, input: { appliedAt: Date; note: string | null; skippedMoves: Promotion['skippedMoves']; unplannedReportIds: string[] }): Promise<void> {
    await PromotionModel.updateOne(
      { _id: id },
      {
        $set: {
          status: 'APPLIED',
          appliedAt: input.appliedAt,
          note: input.note,
          skippedMoves: input.skippedMoves.map((m) => ({ userId: new Types.ObjectId(m.userId), toManagerId: new Types.ObjectId(m.toManagerId) })),
          unplannedReportIds: input.unplannedReportIds.map((u) => new Types.ObjectId(u)),
        },
      },
    );
  }

  async markFailed(id: string, note: string): Promise<void> {
    await PromotionModel.updateOne({ _id: id }, { $set: { note } });
  }

  async cancel(id: string, at: Date): Promise<boolean> {
    const res = await PromotionModel.updateOne({ _id: id, status: 'SCHEDULED' }, { $set: { status: 'CANCELLED', cancelledAt: at } });
    return res.modifiedCount === 1;
  }
}
