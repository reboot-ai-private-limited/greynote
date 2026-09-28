import { isEditableBySubmitter } from '@/modules/approval/approval.public.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { ApprovalsPort } from '../domain/approvals.port.js';
import type { PlanKind } from '../domain/plan.js';

/**
 * A Plan is editable as a draft, and again after a rejection, withdrawal or Admin reopen; frozen
 * while it waits or once it's approved (client §2.5).
 */
export async function assertEditable(approvals: ApprovalsPort, kind: PlanKind, recordId: string): Promise<void> {
  const request = await approvals.getForRecord(kind, recordId);
  if (!request || isEditableBySubmitter(request.status)) return;
  throw AppError.conflict(
    request.status === 'APPROVED'
      ? 'This plan is approved and can’t be edited. Ask Admin to reopen it.'
      : request.status === 'SUBMITTED'
        ? 'This plan is waiting for approval and can’t be edited. Withdraw it first.'
        : 'This plan is waiting for approval and can’t be edited.',
  );
}
