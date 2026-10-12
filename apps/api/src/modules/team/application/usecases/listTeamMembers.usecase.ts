import { narrowToTeam } from '@/shared/access/teamScope.js';
import { buildPaginatedResult, type PaginatedResult } from '@/shared/http/pagination.js';
import type { TeamDirectoryPort, TeamTerritoryPort } from '../../domain/ports.js';

export interface TeamMemberRow {
  id: string;
  employeeCode: string;
  name: string;
  designation: string | null;
  status: 'active' | 'pending' | 'inactive';
  /** 1 = direct report: the manager approves for them; deeper levels are read-only. */
  depth: number;
  /** Whether this person has people of their own below them. */
  isManager: boolean;
  managerId: string | null;
  hq: { id: string; name: string } | null;
  zone: { id: string; name: string } | null;
}

export interface TeamMembersQuery {
  scope: 'direct' | 'indirect' | 'all';
  /** `active` (default) leaves out people who have left or not yet started. */
  status: 'active' | 'all';
  search?: string | undefined;
  /** One person, who must be in the downline (403 otherwise); shown whatever `scope` and `status` say. */
  userId?: string | undefined;
  page: number;
  pageSize: number;
}

/** The manager's people, nearest first then by name. Nobody outside their own downline can appear. */
export class ListTeamMembersUseCase {
  constructor(
    private readonly directory: TeamDirectoryPort,
    private readonly territory: TeamTerritoryPort,
  ) {}

  async execute(
    managerId: string,
    query: TeamMembersQuery,
  ): Promise<PaginatedResult<TeamMemberRow>> {
    const downline = await this.directory.getDownline(managerId);
    const managers = new Set(
      downline.map((m) => m.managerId).filter((id): id is string => id !== null),
    );
    const needle = query.search?.toLowerCase();
    const only =
      query.userId === undefined
        ? null
        : new Set(
            narrowToTeam(
              downline.map((m) => m.id),
              query.userId,
            ),
          );
    const matches = downline.filter((m) =>
      only
        ? only.has(m.id)
        : (query.scope === 'all' || (query.scope === 'direct' ? m.depth === 1 : m.depth > 1)) &&
          (query.status === 'all' || m.status === 'active') &&
          (!needle ||
            m.name.toLowerCase().includes(needle) ||
            m.employeeCode.toLowerCase().includes(needle)),
    );

    const start = (query.page - 1) * query.pageSize;
    const pageRows = matches.slice(start, start + query.pageSize);
    const info = new Map(
      (await this.directory.listFieldEmployees(pageRows.map((m) => m.id))).map((e) => [e.id, e]),
    );
    const hqs = await this.lookup(
      [...new Set([...info.values()].flatMap((e) => (e.hqId ? [e.hqId] : [])))],
      (id) => this.territory.getHq(id),
    );
    const zones = await this.lookup(
      [...new Set([...info.values()].flatMap((e) => (e.zoneId ? [e.zoneId] : [])))],
      (id) => this.territory.getZone(id),
    );

    const rows = pageRows.map((m): TeamMemberRow => {
      const e = info.get(m.id);
      return {
        id: m.id,
        employeeCode: m.employeeCode,
        name: m.name,
        designation: e?.designation ?? null,
        status: m.status,
        depth: m.depth,
        isManager: managers.has(m.id),
        managerId: m.managerId,
        hq: (e?.hqId && hqs.get(e.hqId)) || null,
        zone: (e?.zoneId && zones.get(e.zoneId)) || null,
      };
    });
    return buildPaginatedResult(rows, matches.length, query);
  }

  private async lookup(
    ids: string[],
    get: (id: string) => Promise<{ id: string; name: string } | null>,
  ): Promise<Map<string, { id: string; name: string }>> {
    const found = await Promise.all(ids.map(get));
    return new Map(found.flatMap((f) => (f ? [[f.id, { id: f.id, name: f.name }] as const] : [])));
  }
}
