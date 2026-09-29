/** Field Master Data's narrow view of Territory; `territory.contract` satisfies it structurally. */
export interface TerritoryPort {
  getRoute(routeId: string): Promise<{ id: string; status: 'active' | 'inactive' } | null>;
}
