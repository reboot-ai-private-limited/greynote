import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { Leave, LeaveAttachment } from './leave.entity.js';

export type LeaveBody = Omit<Leave, 'id' | 'userId' | 'revision' | 'createdAt' | 'updatedAt' | 'attachments'>;

export interface LeaveFilter {
  userIds?: string[] | undefined;
  /** Leaves whose range meets [from, to]. */
  from?: string | undefined;
  to?: string | undefined;
}

export interface LeaveRepositoryPort {
  findById(id: string): Promise<Leave | null>;
  /** One person's leaves whose range meets [from, to]. */
  listOverlapping(userId: string, from: string, to: string): Promise<Leave[]>;
  /** Newest first. */
  list(filter: LeaveFilter, page: { page: number; pageSize: number }): Promise<{ items: Leave[]; total: number }>;
  create(userId: string, body: LeaveBody, ctx: TransactionContext): Promise<Leave>;
  /** Replaces the body if still at `expectedRevision`; `null` if it moved on. */
  replace(id: string, expectedRevision: number, body: LeaveBody, ctx: TransactionContext): Promise<Leave | null>;
  existsForLeaveType(leaveTypeId: string): Promise<boolean>;
  /** Adds a file only if the leave has fewer than `max` already (one conditional update); `null` if it is full or the leave is missing. */
  addAttachment(leaveId: string, attachment: Omit<LeaveAttachment, 'id'>, max: number): Promise<Leave | null>;
  /** Takes a file off and returns it (for removing it from storage); `null` if the leave or the file is not there. */
  removeAttachment(leaveId: string, attachmentId: string): Promise<LeaveAttachment | null>;
}
