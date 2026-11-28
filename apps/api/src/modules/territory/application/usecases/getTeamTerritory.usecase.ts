import { AppError } from '@/shared/errors/AppError.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { ManagerDirectoryPort } from '../../domain/managerDirectory.port.js';
import type { Route } from '../../domain/route.entity.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import type { ZoneRepositoryPort } from '../../domain/zone.repository.port.js';
import type { GetManagerCoverageUseCase } from './managerCoverage.usecase.js';

/** Designation levels (MR 1 … NSM 5): a ZSM owns whole Zones; the NSM, with none named, owns every Zone. */
const ZSM = 4;
const NSM = 5;
const ALL = { page: 1, pageSize: 1000 } as const;

export interface TeamHq {
  id: string;
  name: string;
  /** People in the team (the manager included) whose main HQ this is. */
  members: number;
  /** The manager owns it (coverage, or a Zone they own whole) — so it shows even with nobody of theirs in it. */
  owned: boolean;
}
/** An HQ on Admin's view of a person's page (2026-11-28): who of the team is based there, and how many active routes it has. */
export interface PersonTeamHq extends TeamHq {
  /** It is the person's own main HQ. */
  own: boolean;
  /** Team members (the person left out) whose main HQ this is. */
  people: Array<{ id: string; name: string; employeeCode: string; designation: string | null }>;
  activeRoutes: number;
}

export interface TeamZone {
  id: string;
  name: string;
  hqs: TeamHq[];
}

/**
 * A manager's territory, computed on read; nothing is copied onto the manager (decision-log 2026-11-16). An HQ shows when someone in the
 * team has it as their main HQ, or when the manager owns it: named in their coverage, or, for a ZSM or the NSM, inside a Zone they own
 * (a ZSM with no HQs named owns the whole Zone; an NSM with no Zones named owns them all). Zones are the HQs grouped. Routes are not
 * listed here: they load per HQ (`routesInHq`), paged and searched, so a ZSM or the NSM never pulls every route at once.
 */
export class GetTeamTerritoryUseCase {
  constructor(
    private readonly users: ManagerDirectoryPort,
    private readonly coverage: GetManagerCoverageUseCase,
    private readonly hqs: HqRepositoryPort,
    private readonly zones: ZoneRepositoryPort,
    private readonly routes: RouteRepositoryPort,
  ) {}

  async execute(managerId: string): Promise<{ zones: TeamZone[] }> {
    const { members, owned } = await this.scope(managerId);
    const ids = [...new Set([...members.keys(), ...owned])];
    const found = (await this.hqs.findByIds(ids)).filter((h) => h.status === 'active');
    const zoneIds = [...new Set(found.map((h) => h.zoneId))];
    const zoneById = new Map((await Promise.all(zoneIds.map((id) => this.zones.findById(id)))).filter((z) => z !== null).map((z) => [z!.id, z!]));
    return {
      zones: zoneIds
        .filter((id) => zoneById.has(id))
        .map((id) => ({
          id,
          name: zoneById.get(id)!.name,
          hqs: found
            .filter((h) => h.zoneId === id)
            .map((h) => ({ id: h.id, name: h.name, members: members.get(h.id) ?? 0, owned: owned.has(h.id) }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  /**
   * Admin and HR, on a person's page (2026-11-28): the same HQs as their own Team view, each with who of the team is based there and its
   * active routes count. Their own HQ comes first. Someone with nobody below them gets just their own HQ.
   */
  async forPerson(userId: string): Promise<{ hqs: Array<PersonTeamHq & { zoneName: string }> }> {
    const { zones } = await this.execute(userId);
    const downline = (await this.users.getDownline(userId)).map((u) => u.id);
    const people = await this.users.listFieldEmployees([userId, ...downline]);
    const ownHq = people.find((p) => p.id === userId)?.hqId ?? null;
    const hqs = await Promise.all(
      zones.flatMap((z) =>
        z.hqs.map(async (h) => ({
          ...h,
          zoneName: z.name,
          own: h.id === ownHq,
          people: people.filter((p) => p.id !== userId && p.hqId === h.id).map((p) => ({ id: p.id, name: p.name, employeeCode: p.employeeCode, designation: p.designation })).sort((a, b) => a.name.localeCompare(b.name)),
          // Both ends in this HQ — the same rule as the HQ's own route list, so the counts agree (a route into another HQ is left out).
          activeRoutes: (await this.routes.listActiveWithinHqs([h.id])).length,
        })),
      ),
    );
    return { hqs: hqs.sort((a, b) => Number(b.own) - Number(a.own) || a.name.localeCompare(b.name)) };
  }

  /** The active routes of one HQ in the manager's view, paged and searched; an HQ outside it is a 403, never an empty list. */
  async routesInHq(managerId: string, hqId: string, query: { page: number; pageSize: number; search?: string | undefined }): Promise<{ items: Route[]; total: number }> {
    const { members, owned } = await this.scope(managerId);
    if (!members.has(hqId) && !owned.has(hqId)) throw AppError.forbidden('That HQ is not in your territory.');
    return this.routes.list({ ...query, hqId, status: 'active' });
  }

  private async scope(managerId: string): Promise<{ members: Map<string, number>; owned: Set<string> }> {
    // The manager and everyone below them, at any depth (the reporting chain, not the all-staff list: demo accounts are in it too).
    const team = new Set<string>([managerId, ...(await this.users.getDownline(managerId)).map((u) => u.id)]);
    const people = await this.users.listFieldEmployees([...team]);
    const level = people.find((p) => p.id === managerId)?.designationLevel ?? 0;
    const members = new Map<string, number>();
    for (const p of people) if (team.has(p.id) && p.hqId) members.set(p.hqId, (members.get(p.hqId) ?? 0) + 1);

    const cov = await this.coverage.execute(managerId);
    const owned = new Set<string>(cov.hqIds);
    if (level >= ZSM && cov.hqIds.length === 0) {
      const zoneIds = level >= NSM && cov.zoneIds.length === 0 ? (await this.zones.list({ ...ALL, status: 'active' })).items.map((z) => z.id) : cov.zoneIds;
      for (const zoneId of zoneIds) for (const h of (await this.hqs.list({ ...ALL, zoneId, status: 'active' })).items) owned.add(h.id);
    }
    return { members, owned };
  }
}
