import { ROLE_NAMES, type RoleName } from '@greynote/contracts';
import { Schema, model, type Types } from 'mongoose';
import {
  APPROVAL_ACTIONS,
  APPROVAL_AUTHORITIES,
  APPROVAL_STATUSES,
  APPROVAL_WORKFLOWS,
  type ApprovalActionType,
  type ApprovalAuthority,
  type ApprovalStatus,
  type ApprovalWorkflow,
} from '../domain/approvalRequest.entity.js';

interface ApprovalActionDoc {
  action: ApprovalActionType;
  authority: ApprovalAuthority;
  actorId: Types.ObjectId;
  actorRole: RoleName;
  comment: string | null;
  at: Date;
  resultingStatus: ApprovalStatus;
  cycle: number;
}

export interface ApprovalRequestDoc {
  kind: string;
  recordId: string;
  submitterId: Types.ObjectId;
  status: ApprovalStatus;
  workflow: ApprovalWorkflow;
  cycle: number;
  submittedAt: Date;
  decidedAt: Date | null;
  history: ApprovalActionDoc[];
}

// Embedded: a request's history is a handful of entries, always read and written with it.
const actionSchema = new Schema<ApprovalActionDoc>(
  {
    action: { type: String, required: true, enum: APPROVAL_ACTIONS },
    authority: { type: String, required: true, enum: APPROVAL_AUTHORITIES },
    actorId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    actorRole: { type: String, required: true, enum: ROLE_NAMES },
    comment: { type: String, default: null },
    at: { type: Date, required: true },
    resultingStatus: { type: String, required: true, enum: APPROVAL_STATUSES },
    cycle: { type: Number, required: true },
  },
  { _id: false },
);

const approvalRequestSchema = new Schema<ApprovalRequestDoc>({
  kind: { type: String, required: true },
  // A string, not an ObjectId: the approval module doesn't assume how owning modules key records.
  recordId: { type: String, required: true },
  submitterId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  status: { type: String, required: true, enum: APPROVAL_STATUSES },
  workflow: { type: String, required: true, enum: APPROVAL_WORKFLOWS },
  cycle: { type: Number, required: true },
  submittedAt: { type: Date, required: true },
  decidedAt: { type: Date, default: null },
  history: { type: [actionSchema], required: true },
});

// One request per record, ever — a resubmission reuses it as a new cycle (Phase 3 step 3).
approvalRequestSchema.index({ kind: 1, recordId: 1 }, { unique: true });
// "Pending for my direct reports" and "my own requests".
approvalRequestSchema.index({ submitterId: 1, status: 1, submittedAt: -1 });
// Admin/HR queues: open requests by status and kind, newest first.
approvalRequestSchema.index({ status: 1, kind: 1, submittedAt: -1 });

export const ApprovalRequestModel = model<ApprovalRequestDoc>('ApprovalRequest', approvalRequestSchema);
