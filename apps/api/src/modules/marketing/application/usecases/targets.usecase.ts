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
 * Who may act on `userId`'s targets: Admin and HR anyone, and only they may *set*. To *read*, a manager (a FIELD user with
 * people below them) sees themselves and their downline, and a plain MR their own.
 */
async function assertMayAct(users: UserDirectoryPort, actor: Actor, userId: string, mode: 'set' | 'read'): Promise<void> {
  if (actor.role === 'ADMIN' || actor.role === 'HR') return;
  if (mode === 'set') throw new MarketingRefusal(MARKETING_CODES.notYourTeam, 'Only Admin or HR can set targets.');
  if (actor.id === userId) return;
  const downline = actor.role === 'FIELD' ? await users.getDownline(actor.id) : [];
  if (downline.length > 0 && (actor.id === userId || downline.some((u) => u.id === userId))) return;
  throw new MarketingRefusal(MARKETING_CODES.notYourTeam, 'You can only see targets for yourself and your team.');
}

/** An MR is the only one with a target of their own: a manager's is the total of the MRs in their team (decision-log 2026-10-14). */
const MR_LEVEL = 1;
const isManagerLevel = (level: number | undefined): boolean => level !== undefined && level > MR_LEVEL;
async function managerIds(users: UserDirectoryPort, ids: string[]): Promise<Set<string>> {
  return new Set((await users.getDesignationLevels(ids)).filter((l) => isManagerLevel(l.level)).map((l) => l.userId));
}

async function assertScope(products: ProductPort, campaigns: CampaignRepositoryPort, scope: TargetScope): Promise<void> {
  if (scope.productId) {
    const product = await products.getProduct(scope.productId);
    if (!product || product.status !== 'active') throw new MarketingRefusal(MARKETING_CODES.productNotFound, 'That product does not exist or is no longer active.');
  }
  if (scope.campaignId && !(await campaigns.findById(scope.campaignId))) throw new MarketingRefusal(MARKETING_CODES.campaignNotFound, 'No such campaign.');
}

/** What a target says, as a form sends it: when it is set and when it is edited. */
type TargetInput = TargetScope & { targetAmountPaise?: Paise | undefined; targetQty?: number | undefined };

const monthName = (month: string): string =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', month: 'short', year: 'numeric' }).format(new Date(`${month}-01T00:00:00Z`));

/**
 * The checks and arithmetic a target goes through whether it is new or edited: the months inside the current financial year, an active
 * FIELD MR as its subject (a manager's is their team's total), the actor allowed to act on them, an active product, and units and amount
 * as one figure at the product's PTS. Returns the target's key, amount and units.
 */
async function resolveTarget(
  deps: { products: ProductPort; campaigns: CampaignRepositoryPort; users: UserDirectoryPort; config: ConfigReader; now: () => Date },
  actor: Actor,
  userId: string,
  input: TargetInput,
): Promise<{ key: TargetKey; amount: Paise; qty: number | null }> {
  const toMonth = input.toMonth ?? input.month;
  if (toMonth < input.month) throw new MarketingRefusal(MARKETING_CODES.invalidDates, 'A target cannot end before it starts.');
  // Both ends must sit in the current financial year, so the run can never straddle two.
  await assertMonthInCurrentFinancialYear(deps.config, input.month, deps.now(), 'A target');
  await assertMonthInCurrentFinancialYear(deps.config, toMonth, deps.now(), 'A target');
  const subject = await deps.users.findUserSummary(userId);
  if (!subject || subject.status !== 'active' || subject.role !== 'FIELD') throw new MarketingRefusal(MARKETING_CODES.userNotFound, 'That employee does not exist or cannot be given a target.');
  await assertMayAct(deps.users, actor, userId, 'set');
  if ((await managerIds(deps.users, [userId])).has(userId)) {
    throw new MarketingRefusal(MARKETING_CODES.invalidDates, 'A manager’s target is the total of the MRs in their team. Set the target on each MR instead.');
  }
  await assertScope(deps.products, deps.campaigns, input);
  const key: TargetKey = { userId, month: input.month, toMonth, productId: input.productId, campaignId: input.campaignId };
  // Units and amount are one figure at the product's PTS: either given, both kept. A target for all products is an amount only.
  let amount = input.targetAmountPaise;
  let qty: number | null = null;
  if (input.productId) {
    const pts = (await deps.products.getProduct(input.productId))?.ptsPaise ?? null;
    if (input.targetQty !== undefined) {
      if (!pts) throw new MarketingRefusal(MARKETING_CODES.invalidDates, 'This product has no PTS set, so give the target as an amount.');
      qty = input.targetQty;
      amount = qty * pts;
    } else if (pts && amount) qty = Math.max(1, Math.round(amount / pts));
  }
  if (!amount) throw new MarketingRefusal(MARKETING_CODES.invalidDates, 'A target must be more than zero.');
  return { key, amount, qty };
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

  async execute(actor: Actor, input: TargetInput & { userId: string }): Promise<Target> {
    const { key, amount, qty } = await resolveTarget({ products: this.products, campaigns: this.campaigns, users: this.users, config: this.config, now: this.now }, actor, input.userId, input);
    return this.targets.upsert(key, amount, qty, actor.id, this.now());
  }
}

/**
 * Edit a target in place (decision-log 2026-10-22): its months, product (or all products), amount or units. The employee and any campaign
 * stay. Refused (`409`) when the employee already has another target with that product and those months, rather than merging the two;
 * and when the target as it stands is outside the current financial year, like removing it.
 */
export class UpdateTargetUseCase {
  constructor(
    private readonly targets: TargetRepositoryPort,
    private readonly campaigns: CampaignRepositoryPort,
    private readonly products: ProductPort,
    private readonly users: UserDirectoryPort,
    private readonly config: ConfigReader,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(actor: Actor, id: string, input: Omit<TargetInput, 'campaignId'>): Promise<Target> {
    const current = await this.targets.findById(id);
    if (!current) throw new MarketingRefusal(MARKETING_CODES.targetNotFound, 'No such target.');
    await assertMayAct(this.users, actor, current.userId, 'set');
    await assertMonthInCurrentFinancialYear(this.config, current.month, this.now(), 'A target');
    const { key, amount, qty } = await resolveTarget({ products: this.products, campaigns: this.campaigns, users: this.users, config: this.config, now: this.now }, actor, current.userId, { ...input, campaignId: current.campaignId });
    const saved = await this.targets.update(id, key, amount, qty, actor.id, this.now());
    if (saved === null) throw new MarketingRefusal(MARKETING_CODES.targetNotFound, 'No such target.');
    if (saved === 'clash') {
      const product = key.productId ? ((await this.products.getProduct(key.productId))?.name ?? 'this product') : 'all products';
      const months = key.month === key.toMonth ? monthName(key.month) : `${monthName(key.month)} – ${monthName(key.toMonth)}`;
      throw new MarketingRefusal(MARKETING_CODES.targetClash, `There is already a target for ${product} over ${months}. Edit that one instead.`);
    }
    return saved;
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
    // A manager has no target of their own; any set before 2026-10-14 is ignored (the report adds up their MRs').
    if ((await managerIds(this.users, [input.userId])).has(input.userId)) return [];
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
    const everyone = [userId, ...downlineIds];
    const managers = await managerIds(this.users, everyone);
    // Only MRs carry targets: a manager's own (set before 2026-10-14) would count their MRs' twice.
    const rows = (await this.targets.listOverlapping(everyone, scope.month, scope.month, { productId: scope.productId, campaignId: scope.campaignId })).filter((t) => !managers.has(t.userId));
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
  /** In units, for a product target with a PTS; otherwise null. */
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
