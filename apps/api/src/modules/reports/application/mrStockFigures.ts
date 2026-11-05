import type { MrLine } from '../domain/mrFigures.js';
import type { SecondaryLinesPort, SecondaryRollupsPort } from '../domain/ports.js';

export type RollupState = 'NOT_SUBMITTED' | 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';

/**
 * The one source of every sales figure (decision-log 2026-11-05): the approved rows MRs entered for their distributors. Drafts, sent and rejected
 * rows are never read (the port returns approved only), so a month nobody approved is 0. Statements, distributor counts and Done orders no longer
 * feed achievement or the sales reports. `userIds` narrows it to some MRs; left out it is every MR.
 *
 * A manager's own achievement is the team report they submitted and their manager approved (their saved snapshot), plus any approved rows of
 * their own from when they were an MR. Snapshots are never added to MR rows or to each other: company totals take MR rows only.
 */
export class MrStockFigures {
  constructor(private readonly source: SecondaryLinesPort & Partial<SecondaryRollupsPort>) {}

  async lines(userIds: readonly string[] | undefined, fromMonth: string, toMonth: string): Promise<MrLine[]> {
    if (userIds && userIds.length === 0) return [];
    return this.source.listSecondaryLines({ fromMonth, toMonth, ...(userIds && { userIds: [...userIds] }) });
  }

  /** Rows for the figures of a list of people: every MR's own rows, and for each manager their own rows plus their approved snapshot (owner = the manager). */
  async forFigures(mrIds: readonly string[], managerIds: readonly string[], fromMonth: string, toMonth: string): Promise<MrLine[]> {
    const own = await this.lines([...new Set([...mrIds, ...managerIds])], fromMonth, toMonth);
    if (managerIds.length === 0 || !this.source.listSecondaryRollups) return own;
    const snaps = await this.source.listSecondaryRollups({ fromMonth, toMonth, userIds: [...managerIds] });
    return [...own, ...snaps.flatMap((s) => s.lines.map((l): MrLine => ({ userId: s.userId, month: s.month, ...l })))];
  }

  /** Where each manager's team report for a month stands (`NOT_SUBMITTED` when they have not sent one). */
  async rollupStatuses(managerIds: readonly string[], month: string): Promise<Map<string, RollupState>> {
    const out = new Map<string, RollupState>(managerIds.map((id) => [id, 'NOT_SUBMITTED']));
    if (managerIds.length === 0 || !this.source.listSecondaryRollups) return out;
    for (const s of await this.source.listSecondaryRollups({ fromMonth: month, toMonth: month, userIds: [...managerIds], statuses: ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED'] })) out.set(s.userId, s.status);
    return out;
  }
}
