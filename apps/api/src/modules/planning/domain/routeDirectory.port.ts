/** Planning's narrow view of Territory; `territory.contract` satisfies it structurally. */
export interface RouteDirectoryPort {
  /** The active Routes an employee currently covers — what a Plan may name. */
  listRoutesForUser(userId: string): Promise<Array<{ id: string }>>;
}
