import { AppError } from '@/shared/errors/AppError.js';
import { buildPaginatedResult, type PaginatedResult } from '@/shared/http/pagination.js';
import type { RouteDirectoryPort } from '../../domain/routeDirectory.port.js';
import type { PlanPerson, UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { CarryOver } from '../carryOver.js';
import type { ManagerScope } from '../managerScope.js';

export interface TeamRoute {
  id: string;
  name: string;
  routeType: 'HQ' | 'EX_STATION' | 'OUT_STATION';
  hqId: string;
  hqName: string;
  /** The people below the manager who hold this route now. */
  holders: Array<{ id: string; name: string; label: string }>;
  /** Doctors on this route assigned to its holders. */
  doctorCount: number;
}

export interface TeamRoutesPage extends PaginatedResult<TeamRoute> {
  /** The HQs of the matching routes (before the HQ filter), so a picker can start from the HQ. */
  hqs: Array<{ id: string; name: string; routes: number }>;
}

/**
 * The routes a manager may plan: the ones held by anyone below them, plus their own (decision-log 2026-11-17). Paged and searchable, with the
 * HQs listed so a ZSM or NSM starts from an HQ and never loads every route. Each route says who holds it and how many doctors are on it.
 */
export class ListTeamRoutesUseCase {
  constructor(
    private readonly users: UserDirectoryPort,
    private readonly routes: RouteDirectoryPort,
    private readonly scope: ManagerScope,
    private readonly carryOver: CarryOver,
  ) {}

  async execute(managerId: string, q: { hqId?: string | undefined; search?: string | undefined; page: number; pageSize: number }): Promise<TeamRoutesPage> {
    if (!(await this.scope.isManager(managerId))) throw AppError.forbidden('Only a manager can plan routes from their team.');
    const people = [managerId, ...(await this.scope.routePeople(managerId))];
    const all = await this.routes.listRoutesForUsers(people);
    const term = q.search?.trim().toLowerCase();
    const matching = all.filter((r) => !term || r.name.toLowerCase().includes(term) || r.hqName.toLowerCase().includes(term));
    const hqs = [...matching.reduce((m, r) => m.set(r.hqId, { id: r.hqId, name: r.hqName, routes: (m.get(r.hqId)?.routes ?? 0) + 1 }), new Map<string, { id: string; name: string; routes: number }>()).values()].sort((a, b) => a.name.localeCompare(b.name));
    const inHq = matching.filter((r) => !q.hqId || r.hqId === q.hqId).sort((a, b) => a.hqName.localeCompare(b.hqName) || a.name.localeCompare(b.name));
    const pageRows = inHq.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);

    const pairs = await this.routes.listHoldersOfRoutes(pageRows.map((r) => r.id));
    const below = new Set(people);
    const holderIds = [...new Set(pairs.map((p) => p.userId).filter((id) => below.has(id)))];
    const named = new Map<string, PlanPerson>((await this.users.namePeople(holderIds)).map((p) => [p.id, p]));
    const doctorsOf = new Map<string, Array<{ id: string; routeId: string }>>();
    for (const id of holderIds) doctorsOf.set(id, await this.carryOver.directory().listAssignedDoctors(id));

    const items = pageRows.map((r) => {
      const holders = [...new Set(pairs.filter((p) => p.routeId === r.id && below.has(p.userId)).map((p) => p.userId))];
      const doctors = new Set(holders.flatMap((h) => (doctorsOf.get(h) ?? []).filter((d) => d.routeId === r.id).map((d) => d.id)));
      return {
        id: r.id,
        name: r.name,
        routeType: r.routeType,
        hqId: r.hqId,
        hqName: r.hqName,
        holders: holders.flatMap((h) => (named.get(h) ? [{ id: h, name: named.get(h)!.name, label: named.get(h)!.label }] : [])),
        doctorCount: doctors.size,
      };
    });
    return { ...buildPaginatedResult(items, inHq.length, q), hqs };
  }
}

export interface RouteOptions {
  routes: Array<{ id: string; name: string }>;
  /** Who a manager may work with on these routes, each with the chosen routes they hold in brackets (`routes`). */
  people: Array<PlanPerson & { routes: Array<{ id: string; name: string }> }>;
  /** The doctors on these routes assigned to the people who hold them (and the manager). */
  doctors: Array<{ id: string; name: string; routeId: string }>;
}

/**
 * What a manager's Daily Plan offers once the route is chosen: the people below them who hold it (with the routes in brackets) and the
 * doctors on it. Computed live; a route outside the manager's own team gives nothing.
 */
export class RouteOptionsUseCase {
  constructor(
    private readonly users: UserDirectoryPort,
    private readonly routes: RouteDirectoryPort,
    private readonly scope: ManagerScope,
    private readonly carryOver: CarryOver,
  ) {}

  async execute(managerId: string, routeIds: string[]): Promise<RouteOptions> {
    if (!(await this.scope.isManager(managerId))) throw AppError.forbidden('Only a manager can plan the day with their team.');
    const chosen = [...new Set(routeIds)];
    const named = new Map(((await Promise.all(chosen.map((id) => this.routes.getRoute(id)))).flatMap((r) => (r ? [r] : []))).map((r) => [r.id, r.name]));
    const nameOf = (id: string) => ({ id, name: named.get(id) ?? id });

    const options = await this.scope.workWithOptions(managerId, chosen);
    const people = (await this.users.namePeople([...options.keys()]))
      .map((p) => ({ ...p, routes: [...(options.get(p.id) ?? [])].map(nameOf) }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

    // Doctors: on a chosen route and assigned to someone who holds it (or to the manager). Only the direct holders have doctors of their own.
    const holders = [...new Set([managerId, ...(await this.routes.listHoldersOfRoutes(chosen)).map((h) => h.userId)])];
    const below = new Set([managerId, ...(await this.scope.routePeople(managerId))]);
    const seen = new Map<string, { id: string; name: string; routeId: string }>();
    for (const holder of holders.filter((h) => below.has(h))) {
      for (const d of await this.carryOver.directory().listAssignedDoctors(holder)) {
        if (chosen.includes(d.routeId) && !seen.has(d.id)) seen.set(d.id, { id: d.id, name: d.name ?? d.id, routeId: d.routeId });
      }
    }
    return { routes: chosen.map(nameOf), people, doctors: [...seen.values()].sort((a, b) => a.name.localeCompare(b.name)) };
  }
}
