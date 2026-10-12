import { AppError } from '@/shared/errors/AppError.js';
import type { TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import type { ApprovalsPort } from '../../domain/approvals.port.js';
import type { Dcr } from '../../domain/dcr.entity.js';
import type { DcrRepositoryPort } from '../../domain/dcr.repository.port.js';
import type { FieldMasterDataPort } from '../../domain/fieldMasterData.port.js';
import type { ChemistCallRepositoryPort, DoctorCallRepositoryPort, FollowupRepositoryPort } from '../../domain/records.repository.port.js';
import { DCR_KIND, isOpenForLogging } from '../dcrStatus.js';

/**
 * The MR removing one call or follow-up from their own day's report, before the final submission (the app asks "Are you sure?"
 * first). Only the owner, and only while the report is still open — not yet submitted, or sent back. A Doctor Call gives its
 * samples back to the allocation in the same transaction. Once the report is with the manager, the way to change it is the
 * manager sending it back.
 */
export class DeleteDcrRecordUseCase {
  constructor(
    private readonly dcrs: DcrRepositoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly doctorCalls: DoctorCallRepositoryPort,
    private readonly chemistCalls: ChemistCallRepositoryPort,
    private readonly followups: FollowupRepositoryPort,
    private readonly master: FieldMasterDataPort,
    private readonly transactions: TransactionRunnerPort,
  ) {}

  /** A Doctor or Chemist call. */
  async deleteCall(userId: string, dcrId: string, callId: string): Promise<void> {
    const dcr = await this.openOwn(userId, dcrId);
    const [doctorCall, chemistCall] = await Promise.all([this.doctorCalls.findById(callId), this.chemistCalls.findById(callId)]);
    // A record of another report is "not found" here, so the id can't be used to probe other reports.
    if (doctorCall && doctorCall.dcrId === dcr.id) {
      await this.transactions.run(async (ctx) => {
        if (!(await this.doctorCalls.delete(doctorCall.id, ctx))) throw AppError.notFound('No such call on this report.');
        for (const line of doctorCall.samples) await this.master.restoreRemaining(line.allocationId, line.quantity, ctx);
      });
      return;
    }
    if (chemistCall && chemistCall.dcrId === dcr.id) {
      await this.transactions.run(async (ctx) => {
        if (!(await this.chemistCalls.delete(chemistCall.id, ctx))) throw AppError.notFound('No such call on this report.');
      });
      return;
    }
    throw AppError.notFound('No such call on this report.');
  }

  async deleteFollowup(userId: string, dcrId: string, followupId: string): Promise<void> {
    const dcr = await this.openOwn(userId, dcrId);
    const followup = await this.followups.findById(followupId);
    if (!followup || followup.dcrId !== dcr.id) throw AppError.notFound('No such follow-up on this report.');
    await this.transactions.run(async (ctx) => {
      if (!(await this.followups.delete(followup.id, ctx))) throw AppError.notFound('No such follow-up on this report.');
    });
  }

  private async openOwn(userId: string, dcrId: string): Promise<Dcr> {
    const dcr = await this.dcrs.findById(dcrId);
    if (!dcr || dcr.userId !== userId) throw AppError.notFound('No such report.');
    if (!isOpenForLogging(await this.approvals.getForRecord(DCR_KIND, dcr.id))) throw AppError.conflict('This report has been submitted, so its records can no longer be removed.');
    return dcr;
  }
}
