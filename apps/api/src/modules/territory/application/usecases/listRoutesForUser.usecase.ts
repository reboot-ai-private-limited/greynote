import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { PlaceRepositoryPort } from '../../domain/place.repository.port.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import type { RouteSummary } from '../../domain/routeView.js';
import type { UserHqAssignmentRepositoryPort } from '../../domain/userHqAssignment.repository.port.js';
import { toRouteSummaries } from './routeSummaries.js';

/**
 * Routes come from where people are based, not from assignments (decision-log 2026-11-26, phase 2): every employee has one HQ, and the
 * routes they may plan are the active routes whose both ends are places of the HQs in play. For one employee that is their own HQ; for a
 * manager's plan, the caller passes the manager and everyone below them, so it is their own HQ plus their team's HQs. Being able to plan a
 * trip into a team member's HQ does not make it the manager's HQ: TA/DA always reads their one main HQ.
 */
export class ListRoutesForUsersUseCase {
  constructor(
    private readonly userHqs: UserHqAssignmentRepositoryPort,
    private readonly routes: RouteRepositoryPort,
    private readonly places: PlaceRepositoryPort,
    private readonly hqs: HqRepositoryPort,
  ) {}

  async execute(userIds: string[]): Promise<RouteSummary[]> {
    const hqIds = [...new Set((await this.userHqs.findActiveForUsers(userIds)).map((a) => a.hqId))];
    const routes = await this.routes.listActiveWithinHqs(hqIds);
    return (await toRouteSummaries(this.hqs, routes)).sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Who "holds" each of these routes now: everyone based in the HQ of either of its ends (a route not yet migrated: in its HQ), as
   * `{ routeId, userId }` pairs.
   */
  async holders(routeIds: string[]): Promise<Array<{ routeId: string; userId: string }>> {
    const routes = await this.routes.findByIds(routeIds);
    const placeIds = [...new Set(routes.flatMap((r) => [r.fromPlaceId, r.toPlaceId]).filter((id): id is string => id !== null))];
    const placeHq = new Map((await this.places.findByIds(placeIds)).map((p) => [p.id, p.hqId]));
    const hqsOf = new Map(
      routes.map((r) => [r.id, new Set(r.fromPlaceId ? [placeHq.get(r.fromPlaceId), placeHq.get(r.toPlaceId ?? '')].filter((h): h is string => !!h) : [r.hqId])]),
    );
    const people = await this.userHqs.listActiveInHqs([...new Set([...hqsOf.values()].flatMap((s) => [...s]))]);
    return routes.flatMap((r) => people.filter((p) => hqsOf.get(r.id)?.has(p.hqId)).map((p) => ({ routeId: r.id, userId: p.userId })));
  }
}

/** The active routes of one employee's own HQ: Planning's route picker, the doctor rules and the phone's snapshot. */
export class ListRoutesForUserUseCase {
  constructor(private readonly forUsers: ListRoutesForUsersUseCase) {}

  execute(userId: string): Promise<RouteSummary[]> {
    return this.forUsers.execute([userId]);
  }
}
