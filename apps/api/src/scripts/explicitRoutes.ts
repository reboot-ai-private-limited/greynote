/**
 * Pure planning for `migrate-explicit-routes`: routes used to be handed out at read time to anyone covering an HQ (or an un-narrowed Zone)
 * where they had none stored. They are stored-only now, so this works out the rows that keep every employee's list exactly as it was.
 */
export interface PlanInput {
  /** MR, ASM and RSM only: the designations that hold routes. */
  users: Array<{ userId: string; hqIds: string[]; zoneIds: string[] }>;
  hqs: Array<{ id: string; zoneId: string; status: string }>;
  routes: Array<{ id: string; hqId: string; status: string }>;
  /** Active assignments only. */
  assignments: Array<{ userId: string; routeId: string }>;
}

export interface PlannedAssignment {
  userId: string;
  routeId: string;
  hqId: string;
}

export function planExplicitRoutes(input: PlanInput): PlannedAssignment[] {
  const activeRoutes = input.routes.filter((r) => r.status === 'active');
  const hqOf = new Map(input.routes.map((r) => [r.id, r.hqId]));
  const planned: PlannedAssignment[] = [];
  for (const user of input.users) {
    const named = input.hqs.filter((h) => user.hqIds.includes(h.id));
    const namedZones = new Set(named.map((h) => h.zoneId));
    const covered = new Set(named.filter((h) => h.status === 'active').map((h) => h.id));
    // A Zone with none of its HQs named brings all of its HQs.
    for (const zoneId of user.zoneIds.filter((z) => !namedZones.has(z))) {
      for (const h of input.hqs) if (h.zoneId === zoneId && h.status === 'active') covered.add(h.id);
    }
    const mine = input.assignments.filter((a) => a.userId === user.userId);
    // Once a route is stored in an HQ, only the stored ones counted there.
    const hasStored = new Set(mine.map((a) => hqOf.get(a.routeId)).filter((id): id is string => !!id));
    for (const hqId of covered) {
      if (hasStored.has(hqId)) continue;
      for (const r of activeRoutes) if (r.hqId === hqId) planned.push({ userId: user.userId, routeId: r.id, hqId });
    }
  }
  return planned;
}
