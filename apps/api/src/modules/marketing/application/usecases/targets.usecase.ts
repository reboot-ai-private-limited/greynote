import { daysInMonth, formatCalendarDate, parseCalendarMonth } from '@/shared/time/businessTime.js';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import type { Paise } from '@/shared/money/paise.js';
import type { Target, TargetKey } from '../../domain/marketing.entities.js';
import type { CampaignRepositoryPort, TargetRepositoryPort } from '../../domain/marketing.repository.ports.js';
import { targetShare, targetShareQty } from '../../domain/targetRange.js';
import { MARKETING_CODES, MarketingRefusal } from '../../domain/marketingRefusal.js';
import type { ProductPort, SalesPort, UserDirectoryPort } from '../../domain/ports.js';
import { assertMonthInCurrentFinancialYear } from './fyGuard.js';
import type { Actor } from './visualsAndCampaigns.usecase.js';

export interface TargetScope {
  /** The first month of the range, `YYYY-MM`. */
  month: string;
  /** The last month; the same as `month` when left out. */
  toMonth?: string | undefined;
  productId: string | null;
  campaignId: string | null;
}

/**
 * Who may act on `userId`'s targets: Admin anyone; a manager (a FIELD user with people below them) themselves and
 * their downline; nobody else may *set*, and a plain MR may only *read* their own.
 */
async function assertMayAct(users: UserDirectoryPort, actor: Actor, userId: string, mode: 'set' | 'read'): Promise<void> {
  if (actor.role === 'ADMIN') return;
  if (mode === 'read' && actor.id === userId) return;
  const downline = actor.role === 'FIELD' ? await users.getDownline(actor.id) : [];
  if (downline.length > 0 && (actor.id === userId || downline.some((u) => u.id === userId))) return;
  throw new MarketingRefusal(MARKETING_CODES.notYourTeam, mode === 'set' ? 'You can only set targets for yourself and your team.' : 'You can only see targets for yourself and your team.');
}

async function assertScope(products: ProductPort, campaigns: CampaignRepositoryPort, scope: TargetScope): Promise<void> {
  if (scope.productId) {
    const product = await products.getProduct(scope.productId);
    if (!product || product.status !== 'active') throw new MarketingRefusal(MARKETING_CODES.productNotFound, 'That product does not exist or is no longer active.');
  }
  if (scope.campaignId && !(await campaigns.findById(scope.campaignId))) throw new MarketingRefusal(MARKETING_CODES.campaignNotFound, 'No such campaign.');
}

/** Set (or replace) one target over a run of months. A manager sets their own and their downline's; Admin anyone's. */
export class SetTargetUseCase {
  constructor(
    private readonly targets: TargetRepositoryPort,
    private readonly campaigns: CampaignRepositoryPort,
    private readonly products: ProductPort,
    private readonly users: UserDirectoryPort,
    private readonly config: ConfigReader,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(actor: Actor, input: TargetScope & { userId: string; targetAmountPaise?: Paise | undefined; targetQty?: number | undefined }): Promise<Target> {
    const toMonth = input.toMonth ?? input.month;
    if (toMonth < input.month) throw new MarketingRefusal(MARKETING_CODES.invalidDates, 'A target cannot end before it starts.');
    // Both ends must sit in the current financial year, so the run can never straddle two.
    await assertMonthInCurrentFinancialYear(this.config, input.month, this.now(), 'A target');
    await assertMonthInCurrentFinancialYear(this.config, toMonth, this.now(), 'A target');
    const subject = await this.users.findUserSummary(input.userId);
    if (!subject || subject.status !== 'active' || subject.role !== 'FIELD') throw new MarketingRefusal(MARKETING_CODES.userNotFound, 'That employee does not exist or cannot be given a target.');
    await assertMayAct(this.users, actor, input.userId, 'set');
    await assertScope(this.products, this.campaigns, input);
    const key: TargetKey = { userId: input.userId, month: input.month, toMonth, productId: input.productId, campaignId: input.campaignId };
    // Units and amount are one figure at the product's PTR: either given, both kept. A target for all products is an amount only.
    let amount = input.targetAmountPaise;
    let qty: number | null = null;
    if (input.productId) {
      const ptr = (await this.products.getProduct(input.productId))?.ptrPaise ?? null;
      if (input.targetQty !== undefined) {
        if (!ptr) throw new MarketingRefusal(MARKETING_CODES.invalidDates, 'This product has no PTR set, so give the target as an amount.');
        qty = input.targetQty;
        amount = qty * ptr;
      } else if (ptr && amount) qty = Math.max(1, Math.round(amount / ptr));
    }
    if (!amount) throw new MarketingRefusal(MARKETING_CODES.invalidDates, 'A target must be more than zero.');
    return this.targets.upsert(key, amount, qty, actor.id, this.now());
  }
}

/** Take a target away. Same who-may-act and financial-year rules as setting it. */
export class DeleteTargetUseCase {
  constructor(
    private readonly targets: TargetRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly config: ConfigReader,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(actor: Actor, id: string): Promise<void> {
    const target = await this.targets.findById(id);
    if (!target) throw new MarketingRefusal(MARKETING_CODES.targetNotFound, 'No such target.');
    await assertMayAct(this.users, actor, target.userId, 'set');
    await assertMonthInCurrentFinancialYear(this.config, target.month, this.now(), 'A target');
    await this.targets.remove(id);
  }
}

/** One user's targets that touch a range of months, each with the part that falls inside the range. General (no campaign) ones only. */
export class ListTargetsUseCase {
  constructor(
    private readonly targets: TargetRepositoryPort,
    private readonly users: UserDirectoryPort,
  ) {}

  async execute(actor: Actor, input: { userId: string; fromMonth: string; toMonth: string }): Promise<Array<Target & { sharePaise: Paise }>> {
    if (!(await this.users.findUserSummary(input.userId))) throw new MarketingRefusal(MARKETING_CODES.userNotFound, 'No such employee.');
    await assertMayAct(this.users, actor, input.userId, 'read');
    const rows = await this.targets.listOverlapping([input.userId], input.fromMonth, input.toMonth, { campaignId: null });
    const window = { from: input.fromMonth, to: input.toMonth };
    return rows.map((t) => ({ ...t, sharePaise: targetShare(t, window) }));
  }
}

export interface TargetSummary {
  userId: string;
  month: string;
  productId: string | null;
  campaignId: string | null;
  /** This user's own target for the month (a longer target counts its share of the month), `0` if none. */
  ownTargetPaise: Paise;
  /** Everyone below them, summed; a member with no target adds `0`. */
  downlineTargetPaise: Paise;
  downlineCount: number;
  /** Own + downline. */
  effectiveTargetPaise: Paise;
  /** What they and their downline ordered in the period (cancelled orders left out) — worked out now, never stored. */
  achievedPaise: Paise;
  /** The days the orders were counted over. */
  period: { from: string; to: string };
}

/**
 * A user's effective target for a month and what their team ordered (HLD 8): own + the sum of their downline's, against what that same set of
 * people ordered. No product/campaign asks for the *general* target and all sales; a product narrows both to that Product's lines; a campaign
 * narrows the orders to the campaign's dates inside the month. A target over several months counts its even share of the month. Live on every
 * call — the hierarchy is as it is now. (The Sales Dashboard's achievement is the secondary employees enter, not this.)
 */
export class GetTargetSummaryUseCase {
  constructor(
    private readonly targets: TargetRepositoryPort,
    private readonly campaigns: CampaignRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly sales: SalesPort,
  ) {}

  async execute(actor: Actor, userId: string, scope: TargetScope): Promise<TargetSummary> {
    if (!(await this.users.findUserSummary(userId))) throw new MarketingRefusal(MARKETING_CODES.userNotFound, 'No such employee.');
    await assertMayAct(this.users, actor, userId, 'read');

    const { year, month } = parseCalendarMonth(scope.month);
    let from = formatCalendarDate({ year, month, day: 1 });
    let to = formatCalendarDate({ year, month, day: daysInMonth(year, month) });
    if (scope.campaignId) {
      const campaign = await this.campaigns.findById(scope.campaignId);
      if (!campaign) throw new MarketingRefusal(MARKETING_CODES.campaignNotFound, 'No such campaign.');
      from = campaign.startDate > from ? campaign.startDate : from;
      to = campaign.endDate < to ? campaign.endDate : to;
    }

    const downlineIds = (await this.users.getDownline(userId)).map((u) => u.id);
    const window = { from: scope.month, to: scope.month };
    const rows = await this.targets.listOverlapping([userId, ...downlineIds], scope.month, scope.month, { productId: scope.productId, campaignId: scope.campaignId });
    const share = (ids: string[]) => rows.filter((t) => ids.includes(t.userId)).reduce((n, t) => n + targetShare(t, window), 0);
    const ownTargetPaise = share([userId]);
    const downlineTargetPaise = share(downlineIds);
    // A campaign that ends before the month starts (or starts after it ends) leaves no days to count.
    const achievedPaise = from > to ? 0 : await this.sales.sumOrderAmount({ userIds: [userId, ...downlineIds], from, to, productId: scope.productId ?? undefined });
    return { userId, month: scope.month, productId: scope.productId, campaignId: scope.campaignId, ownTargetPaise, downlineTargetPaise, downlineCount: downlineIds.length, effectiveTargetPaise: ownTargetPaise + downlineTargetPaise, achievedPaise, period: { from, to } };
  }
}

export interface TargetShareRow {
  id: string;
  userId: string;
  /** `null` = a target for all products. */
  productId: string | null;
  fromMonth: string;
  toMonth: string;
  amountPaise: Paise;
  /** In units, for a product target with a PTR; otherwise null. */
  qty: number | null;
  /** The part of it inside the window that was asked about. */
  sharePaise: Paise;
  shareQty: number | null;
}

/** The general (no campaign) targets of these users that touch a range of months, with the share inside it — the Sales Dashboard's and employee view's read. */
export class ListTargetSharesUseCase {
  constructor(private readonly targets: TargetRepositoryPort) {}

  async execute(userIds: string[], fromMonth: string, toMonth: string): Promise<TargetShareRow[]> {
    const rows = await this.targets.listOverlapping(userIds, fromMonth, toMonth, { campaignId: null });
    const window = { from: fromMonth, to: toMonth };
    return rows.map((t) => ({ id: t.id, userId: t.userId, productId: t.productId, fromMonth: t.month, toMonth: t.toMonth, amountPaise: t.targetAmountPaise, qty: t.targetQty, sharePaise: targetShare(t, window), shareQty: targetShareQty(t, window) }));
  }
}
