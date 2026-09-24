import { Types, type ClientSession } from 'mongoose';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { ApprovalAction, ApprovalRequest, ApprovalStatus } from '../domain/approvalRequest.entity.js';
import type {
  ApprovalListFilter,
  ApprovalListPage,
  ApprovalRequestRepositoryPort,
  ApprovalTransition,
} from '../domain/approvalRequest.repository.port.js';
import { ApprovalRequestModel, type ApprovalRequestDoc } from './approvalRequest.schema.js';

function toRequest(doc: ApprovalRequestDoc & { _id: unknown }): ApprovalRequest {
  return {
    id: String(doc._id),
    kind: doc.kind,
    recordId: doc.recordId,
    submitterId: String(doc.submitterId),
    status: doc.status,
    workflow: doc.workflow,
    cycle: doc.cycle,
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
      cycle: a.cycle,
    })),
  };
}

const toActionDoc = (a: ApprovalAction) => ({ ...a, actorId: new Types.ObjectId(a.actorId) });

/** The opaque context is a Mongoose session — only adapters know that. */
const session = (ctx?: TransactionContext) => (ctx as ClientSession | undefined) ?? null;

export class MongoApprovalRequestAdapter implements ApprovalRequestRepositoryPort {
  async list(filter: ApprovalListFilter, page: ApprovalListPage): Promise<{ items: ApprovalRequest[]; total: number }> {
    const query: Record<string, unknown> = {};
    if (filter.statuses) query['status'] = { $in: filter.statuses };
    if (filter.kinds) query['kind'] = { $in: filter.kinds };
    if (filter.submitterIds) query['submitterId'] = { $in: filter.submitterIds.map((id) => new Types.ObjectId(id)) };
    if (filter.submittedFrom || filter.submittedTo) {
      query['submittedAt'] = {
        ...(filter.submittedFrom && { $gte: filter.submittedFrom }),
        ...(filter.submittedTo && { $lte: filter.submittedTo }),
      };
    }

    let find = ApprovalRequestModel.find(query).sort({ submittedAt: page.sortOrder === 'asc' ? 1 : -1, _id: 1 });
    if (page.page !== undefined && page.pageSize !== undefined) {
      find = find.skip((page.page - 1) * page.pageSize).limit(page.pageSize);
    }
    const [docs, total] = await Promise.all([find.lean(), ApprovalRequestModel.countDocuments(query)]);
    return { items: docs.map(toRequest), total };
  }

  async findById(id: string): Promise<ApprovalRequest | null> {
    const doc = await ApprovalRequestModel.findById(id).lean();
    return doc ? toRequest(doc) : null;
  }

  async findByRecord(kind: string, recordId: string): Promise<ApprovalRequest | null> {
    const doc = await ApprovalRequestModel.findOne({ kind, recordId }).lean();
    return doc ? toRequest(doc) : null;
  }

  async create(input: Omit<ApprovalRequest, 'id'>, ctx?: TransactionContext): Promise<ApprovalRequest> {
    try {
      const [doc] = await ApprovalRequestModel.create(
        [{ ...input, submitterId: new Types.ObjectId(input.submitterId), history: input.history.map(toActionDoc) }],
        { session: session(ctx) },
      );
      if (!doc) throw AppError.internal('INTERNAL', { reason: 'APPROVAL_CREATE_RETURNED_NOTHING' });
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
    change: ApprovalTransition,
    ctx?: TransactionContext,
  ): Promise<ApprovalRequest | null> {
    const doc = await ApprovalRequestModel.findOneAndUpdate(
      { _id: id, status: expectedStatus },
      {
        $set: { status: change.status, decidedAt: change.decidedAt, ...change.newCycle },
        $push: { history: toActionDoc(change.action) },
      },
      { new: true, session: session(ctx) },
    ).lean();
    return doc ? toRequest(doc) : null;
  }
}
