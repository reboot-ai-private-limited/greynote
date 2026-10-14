import type { DesignationLevelsPort, FieldRosterPort } from '../domain/ports.js';

/** The designation level of an MR; every level above it is a manager. */
export const MR_LEVEL = 1;

/**
 * Whose figures make up a person's targets, achievement and primary. An MR's are their own. A manager's — any designation above MR,
 * whether or not they have a team yet — are the sum of every MR in their whole downline (decision-log 2026-10-14). Only MRs are
 * summed: adding the managers in between would count an MR's figures once for each level above them. The hierarchy is as it is
 * now, so an MR who moved mid-month counts wholly for the manager they have today.
 */
export class MrRollup {
  constructor(private readonly roster: Pick<FieldRosterPort, 'getDownline'> & DesignationLevelsPort) {}

  /** For each user, the ids whose figures are summed (their own for an MR; the MRs below them for a manager, possibly none). */
  async scopes(userIds: readonly string[]): Promise<Map<string, string[]>> {
    const levelOf = new Map((await this.roster.getDesignationLevels([...userIds])).map((l) => [l.userId, l.level]));
    const managers = userIds.filter((id) => (levelOf.get(id) ?? MR_LEVEL) > MR_LEVEL);
    const out = new Map<string, string[]>(userIds.map((id) => [id, [id]]));
    if (managers.length === 0) return out;

    const downlines = new Map(await Promise.all(managers.map(async (id) => [id, (await this.roster.getDownline(id)).map((d) => d.id)] as const)));
    const belowLevels = new Map((await this.roster.getDesignationLevels([...new Set([...downlines.values()].flat())])).map((l) => [l.userId, l.level]));
    for (const [id, below] of downlines) out.set(id, below.filter((b) => belowLevels.get(b) === MR_LEVEL));
    return out;
  }
}
