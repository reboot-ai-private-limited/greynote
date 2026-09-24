import { Types } from 'mongoose';
import { AppError } from '@/shared/errors/AppError.js';
import type { ApprovalAction, ApprovalRequest, ApprovalStatus } from '../domain/approvalRequest.entity.js';
import type { ApprovalRequestRepositoryPort } from '../domain/approvalRequest.repository.port.js';
import { ApprovalRequestModel, type ApprovalRequestDoc } from './approvalRequest.schema.js';

function toRequest(doc: ApprovalRequestDoc & { _id: unknown }): ApprovalRequest {
  return {
    id: String(doc._id),
    kind: doc.kind,
    recordId: doc.recordId,
    submitterId: String(doc.submitterId),
    status: doc.status,
    workflow: doc.workflow,
    submittedAt: doc.submittedAt,
    decidedAt: doc.decidedAt,
    history: doc.history.map((a) => ({
      action: a.action,
      authority: a.authority,
      actorId: String(a.actorId),
      actorRole: a.actorRole,
      comment: a.comment,
      at: a.at,
      resultingStatus: a.resultingStatus,
    })),
  };
}

const toActionDoc = (a: ApprovalAction) => ({ ...a, actorId: new Types.ObjectId(a.actorId) });

export class MongoApprovalRequestAdapter implements ApprovalRequestRepositoryPort {
  async findById(id: string): Promise<ApprovalRequest | null> {
    const doc = await ApprovalRequestModel.findById(id).lean();
    return doc ? toRequest(doc) : null;
  }

  async findByRecord(kind: string, recordId: string): Promise<ApprovalRequest | null> {
    const doc = await ApprovalRequestModel.findOne({ kind, recordId }).lean();
    return doc ? toRequest(doc) : null;
  }

  async create(input: Omit<ApprovalRequest, 'id'>): Promise<ApprovalRequest> {
    try {
      const doc = await ApprovalRequestModel.create({
        ...input,
        submitterId: new Types.ObjectId(input.submitterId),
        history: input.history.map(toActionDoc),
      });
      return toRequest(doc.toObject());
    } catch (err) {
      // Two submits of the same record at once: the unique (kind, recordId) index lets one win.
      if ((err as { code?: number }).code === 11000) {
        throw AppError.conflict('This has already been submitted for approval.');
      }
      throw err;
    }
  }

  async transition(
    id: string,
    expectedStatus: ApprovalStatus,
    change: { status: ApprovalStatus; decidedAt: Date | null; action: ApprovalAction },
  ): Promise<ApprovalRequest | null> {
    const doc = await ApprovalRequestModel.findOneAndUpdate(
      { _id: id, status: expectedStatus },
      {
        $set: { status: change.status, decidedAt: change.decidedAt },
        $push: { history: toActionDoc(change.action) },
      },
      { new: true },
    ).lean();
    return doc ? toRequest(doc) : null;
  }
}
