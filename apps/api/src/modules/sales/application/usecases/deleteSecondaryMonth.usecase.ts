import type { ConfigReader } from '@/shared/config/readConfig.js';
import type { TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import { logger } from '@/shared/logging/logger.js';
import { assertFinancialYearOpen } from '@/shared/time/financialYearClose.js';
import type { SalesApprovalsPort } from '../../domain/approvals.port.js';
import type { MonthlyStockRepositoryPort } from '../../domain/monthlyStock.repository.port.js';
import type { SecondaryFileStoragePort } from '../../domain/proofStorage.port.js';
import type { SecondaryAttachmentRepositoryPort } from '../../domain/secondaryAttachment.repository.port.js';
import type { SecondaryRollupRepositoryPort } from '../../domain/secondaryRollup.repository.port.js';
import type { SecondaryStockLineRepositoryPort } from '../../domain/secondaryStockLine.repository.port.js';
import { STOCK_CODES, StockRefusal } from '../../domain/stockRefusal.js';
import type { Actor } from '../outletAccess.js';
import type { SalesClock } from '../salesClock.js';
import { mrReportRecordId, SECONDARY_SALES_KIND, teamReportRecordId } from './secondaryApproval.js';

/**
 * Admin deletes one employee's month of secondary sales: their per-distributor rows, their team report snapshot if they are a manager, the approval
 * request of each (with its history), the month's files (the stored files too) and any older distributor counts they recorded, so they can enter and
 * send the month again. Orders, Admin's statements and other employees' figures stay. The month must have started and its financial year be open;
 * Admin has no deadline. The old figures go to the log, as there is no audit table.
 */
export class DeleteSecondaryMonthUseCase {
  constructor(
    private readonly stock: MonthlyStockRepositoryPort,
    private readonly approvals: SalesApprovalsPort,
    private readonly transactions: TransactionRunnerPort,
    private readonly clock: SalesClock,
    private readonly config: ConfigReader,
    private readonly lines: SecondaryStockLineRepositoryPort,
    private readonly rollups: SecondaryRollupRepositoryPort,
    private readonly files: SecondaryAttachmentRepositoryPort,
    private readonly storage: SecondaryFileStoragePort,
  ) {}

  /** What a delete would remove, for the confirmation. */
  async preview(actor: Actor, input: { userId: string; month: string }): Promise<{ distributors: number; lines: number; requestWaiting: boolean }> {
    if (actor.role !== 'ADMIN') throw new StockRefusal(STOCK_CODES.adminOnly, 'Only an Admin can delete a month of secondary sales.');
    const rows = await this.stock.listByRecorder(input.userId, input.month);
    const mine = await this.lines.listByUser(input.userId, input.month);
    const requests = await this.requestsOf(input);
    return { distributors: new Set([...rows.map((r) => r.outlet.id), ...mine.map((r) => r.distributorId)]).size, lines: rows.length + mine.length, requestWaiting: requests.some((r) => r.status === 'SUBMITTED' || r.status === 'MANAGER_APPROVED') };
  }

  async execute(actor: Actor, input: { userId: string; month: string }): Promise<{ distributors: number; lines: number; files: number; requestRemoved: boolean }> {
    if (actor.role !== 'ADMIN') throw new StockRefusal(STOCK_CODES.adminOnly, 'Only an Admin can delete a month of secondary sales.');
    if (input.month > (await this.clock.today()).slice(0, 7)) throw new StockRefusal(STOCK_CODES.monthNotStarted, `${input.month} has not started yet.`);
    await assertFinancialYearOpen(this.config, `${input.month}-01`, 'This month');
    const before = await this.stock.listByRecorder(input.userId, input.month);
    const beforeLines = await this.lines.listByUser(input.userId, input.month);
    const files = await this.files.list(input.userId, input.month);
    const requests = await this.requestsOf(input);
    await this.transactions.run(async (ctx) => {
      await this.stock.deleteByRecorder(input.userId, input.month, ctx);
      await this.lines.deleteByUser(input.userId, input.month, ctx);
      await this.rollups.deleteByUser(input.userId, input.month, ctx);
      await this.approvals.deleteForRecord(SECONDARY_SALES_KIND, mrReportRecordId(input.userId, input.month), ctx);
      await this.approvals.deleteForRecord(SECONDARY_SALES_KIND, teamReportRecordId(input.userId, input.month), ctx);
    });
    // The files go after the figures: a failure leaves a file with no figures, which Admin can delete again, never figures that lost their proof.
    for (const f of files) {
      await this.files.remove(f.id);
      await this.storage.remove(f.publicId).catch((e: unknown) => logger.error({ err: e, publicId: f.publicId }, 'could not remove a secondary file from storage'));
    }
    logger.info(
      { audit: 'secondary.month_deleted', by: actor.id, userId: input.userId, month: input.month, requests: requests.map((r) => ({ id: r.id, recordId: r.recordId, status: r.status })), lines: [...before.map((r) => ({ distributorId: r.outlet.id, productId: r.productId, opening: r.openingQty, closing: r.closingQty, status: r.status })), ...beforeLines.map((r) => ({ distributorId: r.distributorId, productId: r.productId, opening: r.openingQty, primary: r.primaryQty, issued: r.issuedQty, status: r.status }))], files: files.map((f) => f.fileName) },
      'an Admin deleted a month of secondary sales',
    );
    return { distributors: new Set([...before.map((r) => r.outlet.id), ...beforeLines.map((r) => r.distributorId)]).size, lines: before.length + beforeLines.length, files: files.length, requestRemoved: requests.length > 0 };
  }

  private async requestsOf(input: { userId: string; month: string }) {
    const found = await Promise.all([mrReportRecordId(input.userId, input.month), teamReportRecordId(input.userId, input.month)].map((id) => this.approvals.getForRecord(SECONDARY_SALES_KIND, id)));
    return found.flatMap((r) => (r ? [r] : []));
  }
}
