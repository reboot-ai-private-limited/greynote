import type { SecondaryReportDto } from '@greynote/contracts';
import type { FieldMasterDataPort } from '../../domain/fieldMasterData.port.js';
import type { SecondaryStockLineRepositoryPort } from '../../domain/secondaryStockLine.repository.port.js';
import { STOCK_CODES, StockRefusal } from '../../domain/stockRefusal.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { Actor } from '../outletAccess.js';
import { summariseSecondary } from './secondarySummary.js';

/**
 * The manager's view: the **approved** rows of the MRs in their whole downline (everyone for Admin), summed distributor by distributor and product.
 * Only MRs (people with nobody below them) contribute, because a manager has no rows of their own and a senior manager must not add a junior manager's
 * roll-up on top of the same MRs. Values are units × PTS.
 */
export class ReadSecondaryReportUseCase {
  constructor(
    private readonly users: UserDirectoryPort,
    private readonly master: FieldMasterDataPort,
    private readonly lines: SecondaryStockLineRepositoryPort,
  ) {}

  async execute(actor: Actor, input: { month: string; managerId?: string | undefined }): Promise<SecondaryReportDto> {
    const managerId = actor.role === 'ADMIN' ? input.managerId : actor.id;
    if (actor.role !== 'ADMIN' && actor.role !== 'FIELD') throw new StockRefusal(STOCK_CODES.adminOnly, 'Not available to your role.');
    if (actor.role === 'FIELD' && input.managerId && input.managerId !== actor.id) {
      if (!(await this.users.getDownline(actor.id)).some((u) => u.id === input.managerId)) throw new StockRefusal(STOCK_CODES.notYourTeam, 'You can only see your own team.');
    }
    const root = actor.role === 'FIELD' ? (input.managerId ?? actor.id) : managerId;
    const pool = root ? (await this.users.getDownline(root)).filter((u) => u.role === 'FIELD' && u.status === 'active') : (await this.users.getUserSummaries(await this.users.listActiveFieldUserIds()));
    const mrs: typeof pool = [];
    for (const u of pool) if ((await this.users.getDownline(u.id)).length === 0) mrs.push(u);
    const names = new Map(mrs.map((u) => [u.id, u.name]));
    const rows = await this.lines.listRange({ fromMonth: input.month, toMonth: input.month, userIds: mrs.map((u) => u.id) }, 100_000);
    const { distributors, totals } = await summariseSecondary(this.master, rows, (id) => names.get(id) ?? '(removed)');
    return { month: input.month, mrCount: mrs.length, approvedMrCount: new Set(rows.map((r) => r.userId)).size, distributors, totals };
  }
}
