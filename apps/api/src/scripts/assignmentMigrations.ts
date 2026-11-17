/**
 * Pure planning for the two one-off, manually run data fixes behind "managers see what their team holds" (decision-log 2026-11-16).
 * Nothing here touches the database: the runners read the facts, call these, and write only with `--apply` and a confirmed database.
 */

/** Chemists became visible by assignment, not by Route. Every active chemist goes to each active FIELD employee who holds its Route today. */
export function planChemistBackfill(input: {
  chemists: ReadonlyArray<{ id: string; routeId: string }>;
  /** Active route assignments: route id → ids of the employees who hold it. */
  holdersByRoute: ReadonlyMap<string, readonly string[]>;
  /** Employees who may be assigned: active FIELD. */
  eligibleUserIds: ReadonlySet<string>;
  /** Already-active `chemistId:userId` pairs, so a second run changes nothing. */
  existing: ReadonlySet<string>;
}): Array<{ chemistId: string; userId: string }> {
  const out: Array<{ chemistId: string; userId: string }> = [];
  for (const c of input.chemists) {
    for (const userId of input.holdersByRoute.get(c.routeId) ?? []) {
      if (!input.eligibleUserIds.has(userId) || input.existing.has(`${c.id}:${userId}`)) continue;
      out.push({ chemistId: c.id, userId });
    }
  }
  return out;
}

export interface ActiveRouteAssignment {
  id: string;
  routeId: string;
  userId: string;
}

export interface CopiedRoutePlan {
  /** Route-assignment ids to end (kept as history). */
  toEnd: string[];
  /** A manager's rows left alone, with why — for the dry-run report. */
  kept: Array<{ userId: string; routeId: string; reason: 'NO_ONE_BELOW_HOLDS_IT' | 'MANAGER_HAS_OWN_DOCTORS_THERE' }>;
}

/**
 * Managers were given their team's routes when an employee was placed under them. Territory is now derived, so those copies can go. A
 * manager's row is a copy only when someone below them also holds the route; a route nobody below holds is reported, not removed. A
 * route where the manager personally has a doctor is also kept: it is their own working route, and removing it would hide that doctor.
 */
export function planCopiedRouteCleanup(input: {
  assignments: readonly ActiveRouteAssignment[];
  /** Everyone at any depth below each person who has a team. */
  downlineOf: ReadonlyMap<string, ReadonlySet<string>>;
  /** `userId:routeId` where that user is assigned an active doctor on that route. */
  ownDoctorRoutes: ReadonlySet<string>;
}): CopiedRoutePlan {
  const holders = new Map<string, Set<string>>();
  for (const a of input.assignments) {
    if (!holders.has(a.routeId)) holders.set(a.routeId, new Set());
    holders.get(a.routeId)!.add(a.userId);
  }
  const plan: CopiedRoutePlan = { toEnd: [], kept: [] };
  for (const a of input.assignments) {
    const team = input.downlineOf.get(a.userId);
    if (!team || team.size === 0) continue; // not a manager
    if (input.ownDoctorRoutes.has(`${a.userId}:${a.routeId}`)) {
      plan.kept.push({ userId: a.userId, routeId: a.routeId, reason: 'MANAGER_HAS_OWN_DOCTORS_THERE' });
      continue;
    }
    const heldBelow = [...(holders.get(a.routeId) ?? [])].some((u) => u !== a.userId && team.has(u));
    if (heldBelow) plan.toEnd.push(a.id);
    else plan.kept.push({ userId: a.userId, routeId: a.routeId, reason: 'NO_ONE_BELOW_HOLDS_IT' });
  }
  return plan;
}

/** `managerId` links → everyone at any depth below each manager. A loop is cut rather than followed. */
export function buildDownlines(managerOf: ReadonlyMap<string, string | null>): Map<string, Set<string>> {
  const down = new Map<string, Set<string>>();
  for (const [user] of managerOf) {
    const seen = new Set<string>([user]);
    let up = managerOf.get(user) ?? null;
    while (up !== null && !seen.has(up)) {
      seen.add(up);
      if (!down.has(up)) down.set(up, new Set());
      down.get(up)!.add(user);
      up = managerOf.get(up) ?? null;
    }
  }
  return down;
}
