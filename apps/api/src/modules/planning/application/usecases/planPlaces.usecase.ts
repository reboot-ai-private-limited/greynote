import { AppError } from '@/shared/errors/AppError.js';
import type { PlanPlace, RouteDirectoryPort } from '../../domain/routeDirectory.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { ManagerScope } from '../managerScope.js';
import type { Actor } from '../planAccess.js';

/** One To a day may go to from a chosen From: along a typed route, or staying at From. */
export interface PlanDestination {
  place: PlanPlace;
  /** Null when staying at From. */
  routeId: string | null;
  /** One way, as typed on the route; null when staying. */
  distanceKm: string | null;
  stay: boolean;
}

/**
 * What a Tour Plan's From and To pickers offer (decision-log 2026-11-26), for the plan's owner: the places of their HQ — a manager's also
 * those of the HQs of everyone below them — and, from a chosen From, only the places a typed route reaches (both ends plannable), plus
 * From itself for a day spent there. The owner reads their own; a manager above them, Admin and HR read theirs to edit their plan.
 */
export class PlanPlacesUseCase {
  constructor(
    private readonly routes: RouteDirectoryPort,
    private readonly users: UserDirectoryPort,
    private readonly scope: ManagerScope,
  ) {}

  async places(actor: Actor, ownerId?: string): Promise<PlanPlace[]> {
    const people = await this.peopleOf(actor, ownerId ?? actor.id);
    const places = await this.routes.listPlacesForUsers(people);
    return [...new Map(places.map((p) => [p.id, p])).values()].sort(
      (a, b) => (a.hqName ?? '').localeCompare(b.hqName ?? '') || Number(b.isHqTown) - Number(a.isHqTown) || a.name.localeCompare(b.name),
    );
  }

  async destinations(actor: Actor, fromPlaceId: string, ownerId?: string): Promise<PlanDestination[]> {
    const people = await this.peopleOf(actor, ownerId ?? actor.id);
    const [places, routes] = await Promise.all([this.routes.listPlacesForUsers(people), this.routes.listRoutesForUsers(people)]);
    const byId = new Map(places.map((p) => [p.id, p]));
    const from = byId.get(fromPlaceId);
    if (!from) throw AppError.badRequest('That place isn’t one this plan can start from.', { field: 'fromPlaceId' });
    const out: PlanDestination[] = [{ place: from, routeId: null, distanceKm: null, stay: true }];
    for (const r of routes as Array<{ id: string; fromPlaceId?: string | null; toPlaceId?: string | null; distanceKm?: string | null }>) {
      const other = r.fromPlaceId === fromPlaceId ? r.toPlaceId : r.toPlaceId === fromPlaceId ? r.fromPlaceId : null;
      const place = other && other !== fromPlaceId ? byId.get(other) : undefined;
      if (place) out.push({ place, routeId: r.id, distanceKm: r.distanceKm ?? null, stay: false });
    }
    return [out[0]!, ...out.slice(1).sort((a, b) => a.place.name.localeCompare(b.place.name))];
  }

  /** The owner, and for a manager everyone below them; checking the caller may read the owner's plan. */
  private async peopleOf(actor: Actor, ownerId: string): Promise<string[]> {
    if (actor.id !== ownerId && actor.role !== 'ADMIN' && actor.role !== 'HR') {
      const chain = await this.users.getManagerChain(ownerId);
      if (!chain.some((m) => m.id === actor.id)) throw AppError.forbidden();
    }
    return [ownerId, ...(await this.scope.routePeople(ownerId))];
  }
}
