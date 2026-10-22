/** Planning's narrow view of Territory; `territory.contract` satisfies it structurally. */
export interface RouteDirectoryPort {
  /** The active Routes an employee currently covers — what a Plan may name. */
  listRoutesForUser(userId: string): Promise<Array<{ id: string; routeType: 'HQ' | 'EX_STATION' | 'OUT_STATION' }>>;
  /** Any route by id, its name and type, or `null` for an unknown id (a deleted route still answers): what a plan's reader is shown. */
  getRoute(routeId: string): Promise<PlanRoute | null>;
}

/** A route a plan names, as its reader sees it: the type says HQ, ex-station or out-station. */
export interface PlanRoute {
  id: string;
  name: string;
  routeType: 'HQ' | 'EX_STATION' | 'OUT_STATION';
}
