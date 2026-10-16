/**
 * Which routes suit an employee (a flag, never a block): those under an HQ they cover, or under a covered Zone that was not narrowed to some of
 * its HQs. Nothing covered means no limit, so nothing is flagged. The same reading of coverage the API uses for holidays. Pure, so it is tested
 * without a browser.
 */
export interface RouteScopeInput {
  coverage: { hqIds: readonly string[]; zoneIds: readonly string[] } | undefined;
  /** Every HQ's zone. */
  zoneOfHq: ReadonlyMap<string, string>;
}

export interface RouteScope {
  /** False when this route's HQ is outside what the employee covers. */
  inScope: (routeHqId: string) => boolean;
  /** Words for the flag and the dialog. */
  label: string;
  /** Nothing is flagged: nothing is covered yet. */
  unlimited: boolean;
}

const UNLIMITED: RouteScope = {
  inScope: () => true,
  label: 'what this employee covers',
  unlimited: true,
};

export function routeScope({ coverage, zoneOfHq }: RouteScopeInput): RouteScope {
  const hqIds = new Set(coverage?.hqIds ?? []);
  const zoneIds = new Set(coverage?.zoneIds ?? []);
  if (hqIds.size === 0 && zoneIds.size === 0) return UNLIMITED;
  // A Zone with some of its HQs named is narrowed to those; a Zone with none named brings every HQ.
  const narrowed = new Set([...hqIds].map((id) => zoneOfHq.get(id) ?? ''));
  return {
    inScope: (h) =>
      hqIds.has(h) || (zoneIds.has(zoneOfHq.get(h) ?? '') && !narrowed.has(zoneOfHq.get(h) ?? '')),
    label: 'the HQs this employee covers',
    unlimited: false,
  };
}
