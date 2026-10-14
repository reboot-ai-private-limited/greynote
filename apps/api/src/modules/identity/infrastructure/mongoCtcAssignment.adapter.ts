import { Types } from 'mongoose';
import type { CtcAssignment } from '../domain/ctcAssignment.entity.js';
import { EMPTY_STRUCTURE, type CtcStructure } from '../domain/ctcBreakdown.js';
import type { CtcAssignmentRepositoryPort } from '../domain/ctcAssignment.repository.port.js';
import { CtcAssignmentModel, type CtcAssignmentDocument } from './ctcAssignment.schema.js';

/** Older revisions carry no structure: they read as the org formula. */
function toStructure(raw: unknown): CtcStructure {
  const s = (raw ?? {}) as Partial<CtcStructure>;
  return {
    ...(s.basicBasisPoints !== undefined && { basicBasisPoints: s.basicBasisPoints }),
    ...(s.basicMonthlyPaise !== undefined && { basicMonthlyPaise: s.basicMonthlyPaise }),
    ruleOverrides: s.ruleOverrides ?? EMPTY_STRUCTURE.ruleOverrides,
    removed: s.removed ?? [],
    extras: s.extras ?? [],
  };
}

function toAssignment(doc: CtcAssignmentDocument & { _id: unknown }): CtcAssignment {
  return {
    id: String(doc._id),
    userId: String(doc.userId),
    ctcAnnualPaise: doc.ctcAnnualPaise,
    effectiveFrom: doc.effectiveFrom,
    overrides: doc.overrides ?? {},
    structure: toStructure(doc.structure),
    lines: doc.lines.map((l) => ({ code: l.code, name: l.name, kind: l.kind, amountPaise: l.amountPaise, isOverridden: l.isOverridden })),
    reason: doc.reason,
    createdBy: String(doc.createdBy),
    createdAt: doc.createdAt,
  };
}

export class MongoCtcAssignmentAdapter implements CtcAssignmentRepositoryPort {
  async create(input: Omit<CtcAssignment, 'id' | 'createdAt'>): Promise<CtcAssignment> {
    const doc = await CtcAssignmentModel.create({ ...input, userId: new Types.ObjectId(input.userId), createdBy: new Types.ObjectId(input.createdBy) });
    return toAssignment(doc.toObject());
  }

  async listByUser(userId: string): Promise<CtcAssignment[]> {
    const docs = await CtcAssignmentModel.find({ userId: new Types.ObjectId(userId) }).sort({ effectiveFrom: -1, createdAt: -1 }).lean();
    return docs.map(toAssignment);
  }

  async findEffective(userId: string, month: string): Promise<CtcAssignment | null> {
    const doc = await CtcAssignmentModel.findOne({ userId: new Types.ObjectId(userId), effectiveFrom: { $lte: month } })
      .sort({ effectiveFrom: -1, createdAt: -1 })
      .lean();
    return doc ? toAssignment(doc) : null;
  }

  async listUserIds(): Promise<string[]> {
    const ids = await CtcAssignmentModel.distinct('userId');
    return ids.map(String);
  }
}
