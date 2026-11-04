/**
 * Until 2026-11-04 an employee saw (and could order from) every distributor whose Zone, HQ or Route met theirs, assigned or not. Now only an
 * assigned distributor shows. This works out, for one distributor, which employees it used to reach by coverage alone, so they can be assigned
 * explicitly and lose nothing on the day the rule changes.
 */
export interface Coverage {
  zoneIds: readonly string[];
  hqIds: readonly string[];
  routeIds: readonly string[];
}

const overlaps = (a: readonly string[], b: readonly string[]): boolean => a.some((id) => b.includes(id));

/** Users whose scope meets the distributor's coverage and who are not assigned yet, in the order given. */
export function usersToAssign(distributor: Coverage & { assignedUserIds: readonly string[] }, scopes: ReadonlyMap<string, Coverage>): string[] {
  const out: string[] = [];
  for (const [userId, scope] of scopes) {
    if (distributor.assignedUserIds.includes(userId)) continue;
    if (overlaps(distributor.zoneIds, scope.zoneIds) || overlaps(distributor.hqIds, scope.hqIds) || overlaps(distributor.routeIds, scope.routeIds)) out.push(userId);
  }
  return out;
}
