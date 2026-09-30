import { daysInMonth, formatCalendarDate, parseCalendarMonth } from '@/shared/time/businessTime.js';
import type { Paise } from '@/shared/money/paise.js';
import type { Target, TargetKey } from '../../domain/marketing.entities.js';
import type { CampaignRepositoryPort, TargetRepositoryPort } from '../../domain/marketing.repository.ports.js';
import { MARKETING_CODES, MarketingRefusal } from '../../domain/marketingRefusal.js';
import type { ProductPort, SalesPort, UserDirectoryPort } from '../../domain/ports.js';
import type { Actor } from './visualsAndCampaigns.usecase.js';

export interface TargetScope {
  month: string;
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

/** Set (or replace) one target. A manager sets their own and their downline's; Admin anyone's. */
export class SetTargetUseCase {
  constructor(
    private readonly targets: TargetRepositoryPort,
    private readonly campaigns: CampaignRepositoryPort,
    private readonly products: ProductPort,
    private readonly users: UserDirectoryPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(actor: Actor, input: TargetScope & { userId: string; targetAmountPaise: Paise }): Promise<Target> {
    const subject = await this.users.findUserSummary(input.userId);
    if (!subject || subject.status !== 'active' || subject.role !== 'FIELD') throw new MarketingRefusal(MARKETING_CODES.userNotFound, 'That employee does not exist or cannot be given a target.');
    await assertMayAct(this.users, actor, input.userId, 'set');
    await assertScope(this.products, this.campaigns, input);
    const key: TargetKey = { userId: input.userId, month: input.month, productId: input.productId, campaignId: input.campaignId };
    return this.targets.upsert(key, input.targetAmountPaise, actor.id, this.now());
  }
}

export interface TargetSummary {
  userId: string;
  month: string;
  productId: string | null;
  campaignId: string | null;
  /** This user's own target row, `0` if none. */
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
 * A user's effective target for a month and its achievement (HLD 8): own row + the sum of their downline's, against
 * what that same set of people ordered. No product/campaign asks for the *general* target and all sales; a product
 * narrows both to that Product's lines; a campaign narrows the orders to the campaign's dates inside the month.
 * Live on every call — the hierarchy is as it is now.
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
    const own = await this.targets.find({ userId, ...scope });
    const downlineTargetPaise = await this.targets.sum(downlineIds, scope);
    const ownTargetPaise = own?.targetAmountPaise ?? 0;
    // A campaign that ends before the month starts (or starts after it ends) leaves no days to count.
    const achievedPaise = from > to ? 0 : await this.sales.sumOrderAmount({ userIds: [userId, ...downlineIds], from, to, productId: scope.productId ?? undefined });
    return { userId, ...scope, ownTargetPaise, downlineTargetPaise, downlineCount: downlineIds.length, effectiveTargetPaise: ownTargetPaise + downlineTargetPaise, achievedPaise, period: { from, to } };
  }
}
