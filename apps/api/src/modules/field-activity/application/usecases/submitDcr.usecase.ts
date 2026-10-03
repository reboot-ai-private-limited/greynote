import type { ApprovalRequest } from '@/modules/approval/approval.public.js';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import { GATE_CODES, GateRefusal } from '../../domain/gateRefusal.js';
import type { ApprovalsPort } from '../../domain/approvals.port.js';
import type { DcrRepositoryPort } from '../../domain/dcr.repository.port.js';
import type { LoggingGate } from '../loggingGate.js';
import { readConfig, parseBoolean, type ConfigReader } from '@/shared/config/readConfig.js';
import { DCR_KIND, isOpenForLogging } from '../dcrStatus.js';
import type { TaDaLifecycle } from './taDaLifecycle.usecase.js';

/**
 * The daily report's Final Submission (LLD field-activity.md): the day's DCR goes to the manager as a `DCR`
 * approval request, in the transaction the sync engine opened, so the request and the sync receipt commit
 * together. It is the **last record of the day's push and depends on all the others**, so it only runs when
 * every record before it applied — a DCR never reaches the manager with holes in it.
 *
 * Refused while the employee is blocked, for a day in the future or not the day it was made, and when the
 * day's Plan isn't approved (an MR can't report a day they were never cleared to work). A day with no calls is
 * a valid report (a meeting day) and creates the envelope here. Resubmitting after a rejection, withdrawal or
 * reopen is a new cycle on the same request; submitting one that's waiting or approved is `DCR_LOCKED`.
 *
 * With `DCR_APPROVAL_REQUIRED` off the request is recorded already approved (nobody reviews it), and the TA/DA
 * the approval hook would have generated is generated here, in the same transaction.
 */
export class SubmitDcrUseCase {
  constructor(
    private readonly gate: LoggingGate,
    private readonly dcrs: DcrRepositoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly taDa: TaDaLifecycle,
    private readonly config: ConfigReader,
  ) {}

  async execute(userId: string, reportDate: string, recordedAt: Date, ctx: TransactionContext): Promise<{ dcrId: string; request: ApprovalRequest }> {
    await this.gate.assertMayAct(userId, reportDate, recordedAt);
    const dcr = await this.dcrs.getOrCreate(userId, reportDate);
    if (!isOpenForLogging(await this.approvals.getForRecord(DCR_KIND, dcr.id))) {
      throw new GateRefusal(GATE_CODES.dcrLocked, 'This day’s report has already been submitted.');
    }
    const autoApprove = !(await readConfig(this.config, 'DCR_APPROVAL_REQUIRED', parseBoolean));
    const request = await this.approvals.submit({ kind: DCR_KIND, recordId: dcr.id, submitterId: userId, autoApprove }, ctx);
    if (autoApprove) await this.taDa.onStatusChange(dcr.id, request.status, ctx, recordedAt);
    return { dcrId: dcr.id, request };
  }
}
