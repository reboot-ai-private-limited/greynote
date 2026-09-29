/** Field Activity's narrow view of Territory; `territory.contract` satisfies it structurally. */
export interface TerritoryPort {
  /** The active Routes an employee currently covers. */
  listRoutesForUser(userId: string): Promise<Array<{ id: string }>>;
}
