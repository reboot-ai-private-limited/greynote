/**
 * A Distributor now has several Routes and a list of assigned people (decision-log 2026-10-09). This works out what to write for one
 * stored document: its single `routeId` becomes `routeIds`, its assigned MR and ASM become `assignedUserIds` (MR first, no repeats), and the old
 * fields and the two order flags (never enforced anywhere) are removed. A document already in the new shape is left alone.
 */
export interface OldDistributor {
  routeIds?: unknown[];
  routeId?: unknown;
  assignedUserIds?: unknown[];
  assignedMrId?: unknown;
  assignedAsmId?: unknown;
}

export interface DistributorPatch {
  set: { routeIds?: unknown[]; assignedUserIds?: unknown[] };
  unset: string[];
}

const OLD_FIELDS = ['routeId', 'assignedMrId', 'assignedAsmId', 'primarySalesEnabled', 'secondarySalesEnabled'] as const;

export function planDistributor(doc: OldDistributor & Record<string, unknown>): DistributorPatch | null {
  const set: DistributorPatch['set'] = {};
  if (!Array.isArray(doc.routeIds) && doc.routeId) set.routeIds = [doc.routeId];
  if (!Array.isArray(doc.assignedUserIds)) {
    const seen = new Set<string>();
    set.assignedUserIds = [doc.assignedMrId, doc.assignedAsmId].filter((id) => {
      if (!id || seen.has(String(id))) return false;
      seen.add(String(id));
      return true;
    });
  }
  const unset = OLD_FIELDS.filter((f) => f in doc);
  return Object.keys(set).length === 0 && unset.length === 0 ? null : { set, unset };
}
