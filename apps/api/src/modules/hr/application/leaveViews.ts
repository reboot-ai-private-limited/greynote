import type { ApprovalStatus } from '@/modules/approval/approval.public.js';
import type { ApprovalsPort } from '../domain/approvals.port.js';
import type { Leave } from '../domain/leave.entity.js';
import type { LeaveTypeRepositoryPort } from '../domain/leaveType.repository.port.js';

export interface LeaveView extends Leave {
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
    const names = new Map((await this.types.list()).map((t) => [t.id, t.name]));
    return Promise.all(
      leaves.map(async (leave) => {
        const request = await this.approvals.getForRecord('LEAVE', leave.id);
        return {
          ...leave,
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
