import type { MrLine } from '../domain/mrFigures.js';
import type { SecondaryLinesPort } from '../domain/ports.js';

/**
 * The one source of every sales figure (decision-log 2026-11-05): the approved rows MRs entered for their distributors. Drafts, sent and rejected
 * rows are never read (the port returns approved only), so a month nobody approved is 0. Statements, distributor counts and Done orders no longer
 * feed achievement or the sales reports. `userIds` narrows it to some MRs (a manager's are the MRs below them); left out it is every MR.
 */
export class MrStockFigures {
  constructor(private readonly source: SecondaryLinesPort) {}

  async lines(userIds: readonly string[] | undefined, fromMonth: string, toMonth: string): Promise<MrLine[]> {
    if (userIds && userIds.length === 0) return [];
    return this.source.listSecondaryLines({ fromMonth, toMonth, ...(userIds && { userIds: [...userIds] }) });
  }
}
