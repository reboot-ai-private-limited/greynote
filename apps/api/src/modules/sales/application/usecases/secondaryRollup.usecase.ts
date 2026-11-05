import type { ApprovalStatus } from '@/modules/approval/approval.public.js';
import type { SecondaryRollupDto } from '@greynote/contracts';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import type { TransactionContext, TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import { assertFinancialYearOpen } from '@/shared/time/financialYearClose.js';
import type { SalesApprovalsPort } from '../../domain/approvals.port.js';
import type { FieldMasterDataPort } from '../../domain/fieldMasterData.port.js';
import type { SecondaryRollup, SecondaryRollupLine, SecondaryRollupSource } from '../../domain/secondaryRollup.entity.js';
import type { SecondaryRollupRepositoryPort } from '../../domain/secondaryRollup.repository.port.js';
import type { SecondaryStockLine } from '../../domain/secondaryStockLine.entity.js';
import type { SecondaryStockLineRepositoryPort } from '../../domain/secondaryStockLine.repository.port.js';
import { STOCK_CODES, StockRefusal } from '../../domain/stockRefusal.js';
import type { DirectoryUser, UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { Actor } from '../outletAccess.js';
import type { SalesClock } from '../salesClock.js';
import { assertMayAct } from './employeeSales.usecase.js';
import { rollupRecordId, SECONDARY_ROLLUP_KIND, STOCK_COUNT_KIND, stockCountRecordId } from './stockCounts.usecase.js';
import { summariseSecondary, type SummaryRow } from './secondarySummary.js';

export { SECONDARY_ROLLUP_KIND, rollupRecordId };

export interface RollupBuild {
  /** The MRs (nobody below them) in the manager's whole downline. */
  mrs: DirectoryUser[];
  sources: SecondaryRollupSource[];
  /** The approved rows of the MRs whose report is approved, one per MR, distributor and product. */
  rows: SecondaryStockLine[];
  lines: SecondaryRollupLine[];
  approvedMrCount: number;
}

interface BuildDeps {
  users: Pick<UserDirectoryPort, 'getDownline'>;
  lines: Pick<SecondaryStockLineRepositoryPort, 'listRange'>;
  approvals: Pick<SalesApprovalsPort, 'listForRecords'>;
}

/**
 * What a manager's month is made of now: every MR in their downline, each MR's submitted report (its approval request), and the approved rows of
 * those whose report is approved, added up by distributor and product. Built from MR rows directly, so a senior manager's figures are never a junior
 * manager's snapshot added to the same MRs.
 */
export async function buildRollup(d: BuildDeps, managerId: string, month: string): Promise<RollupBuild> {
  const mrs: DirectoryUser[] = [];
  for (const u of (await d.users.getDownline(managerId)).filter((x) => x.role === 'FIELD' && x.status === 'active')) if ((await d.users.getDownline(u.id)).length === 0) mrs.push(u);
  const requests = mrs.length ? await d.approvals.listForRecords(STOCK_COUNT_KIND, mrs.map((u) => stockCountRecordId(u.id, month))) : [];
  const requestOf = new Map(requests.map((r) => [r.recordId, r]));
  const approvedIds = mrs.filter((u) => requestOf.get(stockCountRecordId(u.id, month))?.status === 'APPROVED').map((u) => u.id);
  const rows = approvedIds.length ? await d.lines.listRange({ fromMonth: month, toMonth: month, userIds: approvedIds }, 100_000) : [];

  const sources = mrs.map((u): SecondaryRollupSource => {
    const request = requestOf.get(stockCountRecordId(u.id, month));
    const mine = request?.status === 'APPROVED' ? rows.filter((r) => r.userId === u.id) : [];
    return {
      recordId: stockCountRecordId(u.id, month),
      requestId: request?.id ?? null,
      cycle: request?.cycle ?? 0,
      status: request?.status ?? 'NOT_SUBMITTED',
      decidedAt: request?.decidedAt ?? null,
      mrUserId: u.id,
      name: u.name,
      employeeCode: u.employeeCode,
      openingQty: mine.reduce((n, r) => n + r.openingQty, 0),
      primaryQty: mine.reduce((n, r) => n + r.primaryQty, 0),
      issuedQty: mine.reduce((n, r) => n + r.issuedQty, 0),
    };
  });
  const sums = new Map<string, SecondaryRollupLine>();
  for (const r of rows) {
    const k = `${r.distributorId}|${r.productId}`;
    const cur = sums.get(k) ?? { distributorId: r.distributorId, productId: r.productId, openingQty: 0, primaryQty: 0, issuedQty: 0 };
    cur.openingQty += r.openingQty;
    cur.primaryQty += r.primaryQty;
    cur.issuedQty += r.issuedQty;
    sums.set(k, cur);
  }
  return { mrs, sources, rows, lines: [...sums.values()], approvedMrCount: approvedIds.length };
}

/** Which approved MR reports a build or a snapshot rests on: the report, which round of it, and when it was approved. A different set means it is out of date. */
export const rollupSignature = (sources: readonly SecondaryRollupSource[]): string =>
  sources
    .filter((s) => s.status === 'APPROVED')
    .map((s) => `${s.recordId}|${s.requestId}|${s.cycle}|${s.decidedAt?.toISOString() ?? ''}`)
    .sort()
    .join(',');

const SENDABLE = new Set(['NOT_SUBMITTED', 'DRAFT', 'REJECTED']);

/**
 * The manager sends their month of secondary sales (the read-only sum of the approved MR reports below them) to their own manager, Admin if none. The
 * snapshot, with their designation then and a reference to each MR's approved report, is saved and approved as one record, in one transaction. A month
 * with no approved MR report has nothing to send, and one already sent or approved is locked until it is withdrawn, rejected or reopened.
 */
export class SubmitSecondaryRollupUseCase {
  constructor(
    private readonly users: UserDirectoryPort,
    private readonly lines: SecondaryStockLineRepositoryPort,
    private readonly rollups: SecondaryRollupRepositoryPort,
    private readonly approvals: SalesApprovalsPort,
    private readonly transactions: TransactionRunnerPort,
    private readonly clock: SalesClock,
    private readonly config: ConfigReader,
  ) {}

  async execute(actor: Actor, month: string): Promise<{ requestId: string; mrReports: number }> {
    if (actor.role !== 'FIELD') throw new StockRefusal(STOCK_CODES.managerOnly, 'Only a manager sends a team report.');
    if (month > (await this.clock.today()).slice(0, 7)) throw new StockRefusal(STOCK_CODES.monthNotStarted, `${month} has not started yet.`);
    await assertFinancialYearOpen(this.config, `${month}-01`, 'This month');
    const built = await buildRollup({ users: this.users, lines: this.lines, approvals: this.approvals }, actor.id, month);
    if (built.mrs.length === 0) throw new StockRefusal(STOCK_CODES.managerOnly, 'Only a manager with MRs below them sends a team report.');
    const existing = await this.rollups.find(actor.id, month);
    if (existing && (existing.status === 'PENDING' || existing.status === 'APPROVED')) throw new StockRefusal(STOCK_CODES.secondaryLocked, `This month is ${existing.status === 'PENDING' ? 'waiting for approval' : 'approved'}. Withdraw it, or ask your manager to reopen it, before sending it again.`);
    if (built.approvedMrCount === 0) throw new StockRefusal(STOCK_CODES.secondaryNothingToSend, 'None of your MRs has an approved report for this month yet.');

    const [person] = await this.users.namePeople([actor.id]);
    const [level] = await this.users.getDesignationLevels([actor.id]);
    const at = this.clock.now();
    return this.transactions.run(async (ctx) => {
      const request = await this.approvals.submit({ kind: SECONDARY_ROLLUP_KIND, recordId: rollupRecordId(actor.id, month), submitterId: actor.id }, ctx);
      await this.rollups.save({ userId: actor.id, month, status: 'PENDING', requestId: request.id, designation: { name: person?.designation ?? null, level: level?.level ?? null }, lines: built.lines, sources: built.sources, submittedAt: at, approvedAt: null }, ctx);
      return { requestId: request.id, mrReports: built.approvedMrCount };
    });
  }
}

/** The approval's effect on the manager's snapshot, inside the approval's own transaction. */
export function makeSecondaryRollupStatusHandler(rollups: SecondaryRollupRepositoryPort, now: () => Date): (change: { recordId: string; status: ApprovalStatus }, ctx: TransactionContext) => Promise<void> {
  return async ({ recordId, status }, ctx) => {
    const [userId, month] = recordId.split(':');
    if (!userId || !month) return;
    const who = { userId, month };
    if (status === 'APPROVED') await rollups.setStatus(who, ['PENDING'], 'APPROVED', now(), ctx);
    else if (status === 'REJECTED') await rollups.setStatus(who, ['PENDING'], 'REJECTED', undefined, ctx);
    else if (status === 'WITHDRAWN' || status === 'REOPENED') await rollups.setStatus(who, ['PENDING', 'APPROVED'], 'DRAFT', null, ctx);
  };
}

/**
 * A manager's month of secondary sales, for the manager, the manager above, or Admin: the saved snapshot once it has been sent, otherwise the live sum
 * of the approved MR reports. Says whether an MR report has changed since the snapshot (it is then out of date), and whether the manager may send it.
 */
export class ReadSecondaryRollupUseCase {
  constructor(
    private readonly users: UserDirectoryPort,
    private readonly master: FieldMasterDataPort,
    private readonly lines: SecondaryStockLineRepositoryPort,
    private readonly rollups: SecondaryRollupRepositoryPort,
    private readonly approvals: SalesApprovalsPort,
  ) {}

  async execute(actor: Actor, input: { userId: string; month: string }): Promise<SecondaryRollupDto> {
    await assertMayAct(this.users, actor, input.userId);
    const live = await buildRollup({ users: this.users, lines: this.lines, approvals: this.approvals }, input.userId, input.month);
    const saved: SecondaryRollup | null = await this.rollups.find(input.userId, input.month);
    const showSaved = !!saved && saved.status !== 'DRAFT';
    const sources = showSaved ? saved.sources : live.sources;
    const nameOf = new Map(live.mrs.map((u) => [u.id, u.name]));
    const rows: SummaryRow[] = showSaved ? saved.lines : live.rows;
    const { distributors, totals } = await summariseSecondary(this.master, rows, (id) => nameOf.get(id) ?? '(removed)');
    const status: SecondaryRollupDto['status'] = saved ? saved.status : 'NOT_SUBMITTED';
    const outOfDate = showSaved && rollupSignature(saved.sources) !== rollupSignature(live.sources);
    return {
      userId: input.userId,
      month: input.month,
      status,
      saved: showSaved,
      designation: saved ? saved.designation : null,
      mrCount: sources.length,
      approvedMrCount: sources.filter((s) => s.status === 'APPROVED').length,
      outOfDate,
      canSubmit: actor.id === input.userId && live.mrs.length > 0 && live.approvedMrCount > 0 && SENDABLE.has(saved ? saved.status : 'NOT_SUBMITTED'),
      requestId: saved?.requestId ?? null,
      submittedAt: saved?.submittedAt.toISOString() ?? null,
      approvedAt: saved?.approvedAt?.toISOString() ?? null,
      distributors,
      totals,
      sources: sources.map((s) => ({ ...s, decidedAt: s.decidedAt?.toISOString() ?? null })),
    };
  }
}
