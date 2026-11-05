import type { ApprovalStatus } from '@/modules/approval/approval.public.js';
import type { SecondaryStockDistributorDto, SecondaryStockLineDto, SecondaryStockMonthDto, SecondaryStockTotalsDto, StockCountStatus } from '@greynote/contracts';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import type { TransactionContext, TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import { monthRange } from '@/shared/time/businessTime.js';
import { assertFinancialYearOpen } from '@/shared/time/financialYearClose.js';
import type { SalesApprovalsPort } from '../../domain/approvals.port.js';
import type { FieldMasterDataPort } from '../../domain/fieldMasterData.port.js';
import type { MonthlyStockRepositoryPort } from '../../domain/monthlyStock.repository.port.js';
import type { OrderRepositoryPort } from '../../domain/order.repository.port.js';
import type { SalesLateGate } from '../../domain/salesLateGate.port.js';
import { closingOf, previousMonthOf, type SecondaryStockLine, type SecondaryStockLineInput } from '../../domain/secondaryStockLine.entity.js';
import type { SecondaryAttachmentRepositoryPort } from '../../domain/secondaryAttachment.repository.port.js';
import type { SecondaryStockLineRepositoryPort } from '../../domain/secondaryStockLine.repository.port.js';
import { STOCK_CODES, StockRefusal } from '../../domain/stockRefusal.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { Actor } from '../outletAccess.js';
import type { SalesClock } from '../salesClock.js';
import { assertMayAct, assertMonthOpenForEntry } from './employeeSales.usecase.js';
import { monthStatusOf, STOCK_COUNT_KIND, stockCountRecordId } from './stockCounts.usecase.js';

const MAX_QTY = 100_000_000;

/** Only an MR (a field employee with nobody below them) enters secondary stock; managers read and approve it, and Admin corrects through reopen. */
export async function assertMr(users: UserDirectoryPort, actor: Actor): Promise<void> {
  if (actor.role !== 'FIELD' || (await users.getDownline(actor.id)).length > 0) throw new StockRefusal(STOCK_CODES.mrOnly, 'Only an MR enters secondary sales.');
}

export interface SecondaryStockDeps {
  users: UserDirectoryPort;
  master: FieldMasterDataPort;
  lines: SecondaryStockLineRepositoryPort;
  stock: MonthlyStockRepositoryPort;
  clock: SalesClock;
  config: ConfigReader;
  late?: SalesLateGate | undefined;
}

/**
 * The MR saves their month's figures for one or more distributors as drafts, in units: opening, primary (received) and issued (secondary). Closing is
 * derived, so a row where issued exceeds opening + primary is refused. A month already sent or approved is locked until it is withdrawn or rejected.
 * Saving again overwrites, so a replay is harmless.
 */
export class SaveSecondaryStockUseCase {
  constructor(private readonly d: SecondaryStockDeps) {}

  async execute(actor: Actor, input: { month: string; lines: SecondaryStockLineInput[] }, ctx?: TransactionContext): Promise<{ saved: number }> {
    await assertMr(this.d.users, actor);
    await assertMonthOpenForEntry({ clock: this.d.clock, stock: this.d.stock, config: this.d.config, late: this.d.late }, actor, input.month, actor.id);
    for (const l of input.lines) {
      for (const n of [l.openingQty, l.primaryQty, l.issuedQty]) if (!Number.isInteger(n) || n < 0 || n > MAX_QTY) throw new StockRefusal(STOCK_CODES.invalidPayload, 'Quantities are whole units.');
      if (closingOf(l) < 0) throw new StockRefusal(STOCK_CODES.invalidPayload, 'Issued cannot be more than opening plus primary.');
    }
    const mine = await this.d.lines.listByUser(actor.id, input.month);
    const held = mine.find((r) => r.status === 'PENDING' || r.status === 'APPROVED');
    if (held) throw new StockRefusal(STOCK_CODES.secondaryLocked, `This month is ${held.status === 'PENDING' ? 'waiting for approval' : 'approved'}. Withdraw it, or ask your manager to reopen it, before changing it.`);
    for (const id of new Set(input.lines.map((l) => l.distributorId))) {
      const dist = await this.d.master.getDistributor(id);
      if (!dist || dist.status !== 'active') throw new StockRefusal(STOCK_CODES.outletNotFound, 'That distributor does not exist or is no longer active.');
      if (!(await this.d.master.canActOnDistributor(actor.id, id))) throw new StockRefusal(STOCK_CODES.outletNotYours, 'That distributor is not assigned to you.');
    }
    for (const id of new Set(input.lines.map((l) => l.productId))) {
      const p = await this.d.master.getProduct(id);
      if (!p || p.status !== 'active') throw new StockRefusal(STOCK_CODES.productNotFound, 'A product in the list does not exist or is no longer active.');
    }
    await this.d.lines.upsertMany(actor.id, input.month, input.lines, 'DRAFT', this.d.clock.now(), ctx);
    return { saved: input.lines.length };
  }
}

/** The MR sends the finished month to their manager (Admin if none): drafts and rejected rows become pending and one approval request starts, in one transaction. */
export class SubmitSecondaryStockUseCase {
  constructor(
    private readonly users: UserDirectoryPort,
    private readonly lines: SecondaryStockLineRepositoryPort,
    private readonly approvals: SalesApprovalsPort,
    private readonly transactions: TransactionRunnerPort,
    private readonly clock: SalesClock,
    private readonly config: ConfigReader,
    private readonly files: SecondaryAttachmentRepositoryPort,
  ) {}

  async execute(actor: Actor, month: string): Promise<{ requestId: string; sent: number }> {
    await assertMr(this.users, actor);
    if (month > (await this.clock.today()).slice(0, 7)) throw new StockRefusal(STOCK_CODES.monthNotStarted, `${month} has not started yet.`);
    await assertFinancialYearOpen(this.config, `${month}-01`, 'This month');
    // Proof is required (2026-11-05): at least one photo or PDF for the month. Checked after "nothing to send" so an empty month still says so.
    const pending = (await this.lines.listByUser(actor.id, month)).some((r) => r.status === 'DRAFT' || r.status === 'REJECTED');
    if (pending && (await this.files.list(actor.id, month)).length === 0) throw new StockRefusal(STOCK_CODES.attachmentRequired, 'Attach at least one file as proof before you submit.');
    return this.transactions.run(async (ctx) => {
      const sent = await this.lines.setStatus({ userId: actor.id, month }, ['DRAFT', 'REJECTED'], 'PENDING', ctx);
      if (sent === 0) throw new StockRefusal(STOCK_CODES.secondaryNothingToSend, 'There are no secondary figures to send for this month.');
      const request = await this.approvals.submit({ kind: STOCK_COUNT_KIND, recordId: stockCountRecordId(actor.id, month), submitterId: actor.id }, ctx);
      return { requestId: request.id, sent };
    });
  }
}

/** The approval's effect on the month's secondary rows, inside the approval's own transaction. */
export function makeSecondaryStockStatusHandler(lines: SecondaryStockLineRepositoryPort): (change: { recordId: string; status: ApprovalStatus }, ctx: TransactionContext) => Promise<void> {
  return async ({ recordId, status }, ctx) => {
    const [userId, month] = recordId.split(':');
    if (!userId || !month) return;
    const who = { userId, month };
    if (status === 'APPROVED') await lines.setStatus(who, ['PENDING'], 'APPROVED', ctx);
    else if (status === 'REJECTED') await lines.setStatus(who, ['PENDING'], 'REJECTED', ctx);
    else if (status === 'WITHDRAWN' || status === 'REOPENED') await lines.setStatus(who, ['PENDING', 'APPROVED'], 'DRAFT', ctx);
  };
}

const EMPTY: SecondaryStockTotalsDto = { openingQty: 0, primaryQty: 0, issuedQty: 0, closingQty: 0, issuedAmountPaise: 0, closingAmountPaise: 0 };
export function addTotals(a: SecondaryStockTotalsDto, l: Pick<SecondaryStockLineDto, 'openingQty' | 'primaryQty' | 'issuedQty' | 'closingQty' | 'issuedAmountPaise' | 'closingAmountPaise'>): SecondaryStockTotalsDto {
  return { openingQty: a.openingQty + l.openingQty, primaryQty: a.primaryQty + l.primaryQty, issuedQty: a.issuedQty + l.issuedQty, closingQty: a.closingQty + l.closingQty, issuedAmountPaise: a.issuedAmountPaise + (l.issuedAmountPaise ?? 0), closingAmountPaise: a.closingAmountPaise + (l.closingAmountPaise ?? 0) };
}
export const emptyTotals = (): SecondaryStockTotalsDto => ({ ...EMPTY });

/**
 * An MR's month, distributor by distributor, for every distributor assigned to them and every active product: a saved row shows what was saved, an
 * unsaved one its defaults (opening = last approved month's closing, primary = their own Done orders). The entry screen reads it, and so does the
 * manager's approval card. Admin, the MR, or the manager above.
 */
export class ReadSecondaryStockUseCase {
  constructor(
    private readonly users: UserDirectoryPort,
    private readonly master: FieldMasterDataPort,
    private readonly lines: SecondaryStockLineRepositoryPort,
    private readonly orders: OrderRepositoryPort,
    private readonly clock: SalesClock,
    private readonly files?: SecondaryAttachmentRepositoryPort,
  ) {}

  async execute(actor: Actor, input: { userId: string; month: string }): Promise<SecondaryStockMonthDto> {
    await assertMayAct(this.users, actor, input.userId);
    const { userId, month } = input;
    const prev = previousMonthOf(month);
    const attachments = ((await this.files?.list(userId, month)) ?? []).map((f) => ({ id: f.id, url: f.url, fileName: f.fileName, mimeType: f.mimeType, sizeBytes: f.sizeBytes, uploadedBy: f.uploadedBy, uploadedAt: f.uploadedAt.toISOString() }));
    const [saved, prevLines, products, assigned, timeZone, dayStart] = await Promise.all([
      this.lines.listByUser(userId, month),
      this.lines.listRange({ fromMonth: prev, toMonth: prev, userIds: [userId] }, 50_000),
      this.master.listActiveProducts(),
      this.master.listOutletsForUser(userId),
      this.clock.timeZone(),
      this.clock.dayStart(),
    ]);
    const { from, to } = monthRange(month);
    const delivered = new Map<string, number>();
    for (const s of await this.orders.sumUserOrders({ from, to, timeZone, dayStart, userIds: [userId] })) if (s.month === month) delivered.set(`${s.distributorId}|${s.productId}`, (delivered.get(`${s.distributorId}|${s.productId}`) ?? 0) + s.quantity);
    const prevClosing = new Map(prevLines.map((r) => [`${r.distributorId}|${r.productId}`, closingOf(r)]));
    const savedBy = new Map(saved.map((r) => [`${r.distributorId}|${r.productId}`, r]));
    const ids = new Map(assigned.distributors.map((d) => [d.id, d.name]));
    for (const r of saved) if (!ids.has(r.distributorId)) ids.set(r.distributorId, (await this.master.getDistributor(r.distributorId))?.name ?? '(removed)');

    const distributors: SecondaryStockDistributorDto[] = [];
    for (const [distributorId, name] of ids) {
      let totals = emptyTotals();
      const rows = products.map((p): SecondaryStockLineDto => {
        const key = `${distributorId}|${p.id}`;
        const row: SecondaryStockLine | undefined = savedBy.get(key);
        const suggestedOpeningQty = Math.max(0, prevClosing.get(key) ?? 0);
        const suggestedPrimaryQty = delivered.get(key) ?? 0;
        const openingQty = row?.openingQty ?? suggestedOpeningQty;
        const primaryQty = row?.primaryQty ?? suggestedPrimaryQty;
        const issuedQty = row?.issuedQty ?? 0;
        const closingQty = openingQty + primaryQty - issuedQty;
        const pts = p.ptsPaise ?? null;
        const dto: SecondaryStockLineDto = { product: { id: p.id, name: p.name, sku: p.sku }, openingQty, primaryQty, issuedQty, closingQty, suggestedOpeningQty, suggestedPrimaryQty, openingEdited: !!row && row.openingQty !== suggestedOpeningQty, primaryEdited: !!row && row.primaryQty !== suggestedPrimaryQty, saved: !!row, ptsPaise: pts, issuedAmountPaise: pts ? issuedQty * pts : null, closingAmountPaise: pts ? closingQty * pts : null };
        totals = addTotals(totals, dto);
        return dto;
      }).sort((a, b) => a.product.name.localeCompare(b.product.name));
      const mine = saved.filter((r) => r.distributorId === distributorId);
      distributors.push({ distributorId, name, status: monthStatusOf(mine.map((r) => r.status)) as StockCountStatus | 'NOT_ENTERED', lines: rows, totals });
    }
    distributors.sort((a, b) => a.name.localeCompare(b.name));
    return { userId, month, status: monthStatusOf(saved.map((r) => r.status)) as StockCountStatus | 'NOT_ENTERED', attachments, attachmentCount: attachments.length, distributors, totals: distributors.reduce((t, d) => addTotals(t, { ...d.totals }), emptyTotals()) };
  }
}
