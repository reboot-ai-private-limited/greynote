import type { ApprovalStatus } from '@/modules/approval/approval.public.js';
import type { ApprovalsPort } from '../domain/approvals.port.js';
import type { Leave } from '../domain/leave.entity.js';
import { toAttachmentView, type LeaveAttachmentView } from './leaveProof.js';
import type { LeaveTypeRepositoryPort } from '../domain/leaveType.repository.port.js';

export interface LeaveView extends Omit<Leave, 'attachments'> {
  /** The proof files, without their storage ids. */
  attachments: LeaveAttachmentView[];
  /** Whether this kind of leave takes proof — what lets the app show an "attach" button. */
  allowsProof: boolean;
  leaveTypeName: string;
  status: ApprovalStatus;
  /** For `/api/approvals/:id` (history, and the `cycle` a decision must name). */
  approval: { requestId: string; cycle: number; submittedAt: Date; decidedAt: Date | null } | null;
}

export class LeaveViews {
  constructor(
    private readonly approvals: ApprovalsPort,
    private readonly types: LeaveTypeRepositoryPort,
  ) {}

  async many(leaves: Leave[]): Promise<LeaveView[]> {
    const typeRows = await this.types.list();
    const names = new Map(typeRows.map((t) => [t.id, t.name]));
    const proof = new Map(typeRows.map((t) => [t.id, t.allowsProof]));
    return Promise.all(
      leaves.map(async (leave) => {
        const request = await this.approvals.getForRecord('LEAVE', leave.id);
        return {
          ...leave,
          attachments: leave.attachments.map(toAttachmentView),
          allowsProof: proof.get(leave.leaveTypeId) ?? false,
          leaveTypeName: names.get(leave.leaveTypeId) ?? '',
          // A Leave always has a request: it's created in the same transaction.
          status: request?.status ?? 'SUBMITTED',
          approval: request && {
            requestId: request.id,
            cycle: request.cycle,
            submittedAt: request.submittedAt,
            decidedAt: request.decidedAt,
          },
        };
      }),
    );
  }

  async one(leave: Leave): Promise<LeaveView> {
    return (await this.many([leave]))[0]!;
  }
}
