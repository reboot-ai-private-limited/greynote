import { apiGet } from './api';
import type { Paged } from './team-section';

/**
 * What a manager sees of the team's chemists, distributors and territory (docs/mobile/team-visibility.md). All of it is computed by the server
 * from the people below the manager, never copied, and read online only (not in the offline snapshot). Lists page 20 at a time.
 */
export type Holder = { userId: string; name: string; employeeCode: string };

export type TeamChemist = { id: string; routeId: string; name: string; address: string; phone?: string | null; status: string; assignedTo: Holder[] };
export type TeamDistributor = { id: string; name: string; gstNumber?: string | null; contactPerson?: string | null; mobile?: string | null; address?: string | null; status: string; assignedTo: Holder[] };
export type TeamHq = { id: string; name: string; members: number; owned: boolean };
export type TeamZone = { id: string; name: string; hqs: TeamHq[] };
export type HqRoute = { id: string; name: string; routeType?: string };

export const TEAM_PAGE_SIZE = 20;

const page = (p: number, search: string) => `page=${p}&pageSize=${TEAM_PAGE_SIZE}${search.trim() ? `&search=${encodeURIComponent(search.trim().slice(0, 100))}` : ''}`;

export const listTeamChemistsPage = (p: number, search: string, userId?: string) => apiGet<Paged<TeamChemist>>(`/field-master-data/chemists/team?${page(p, search)}${userId ? `&userId=${userId}` : ''}`);
export const listTeamDistributorsPage = (p: number, search: string, userId?: string) => apiGet<Paged<TeamDistributor>>(`/field-master-data/distributors/team?${page(p, search)}${userId ? `&userId=${userId}` : ''}`);
export const getTeamTerritory = async () => (await apiGet<{ zones: TeamZone[] }>('/territory/team')).zones;
export const listHqRoutesPage = (hqId: string, p: number, search: string) => apiGet<Paged<HqRoute>>(`/territory/team/hqs/${hqId}/routes?${page(p, search)}`);

/** "Asha", "Asha, Ravi", or "Asha +2": who holds a row, short enough for one line. */
export const holdersText = (h: Holder[]) => (h.length === 0 ? 'nobody in your team' : h.length <= 2 ? h.map((x) => x.name).join(', ') : `${h[0]?.name} +${h.length - 1}`);
