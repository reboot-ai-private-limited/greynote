import { useMemo } from 'react';

import { useCurrentUser } from '@/hooks/use-current-user';
import { listAllTeamDoctors, type TeamDoctor } from '@/lib/added-doctors';
import { useCachedSource } from '@/offline/cache';
import { useCachedFetch } from '@/offline/cached-fetch';
import type { FieldMasterDataSnapshot, GeoPoint } from '@/types/sync';

/** A doctor this employee can plan or call on: their own, or for a manager one assigned to anyone below them. */
export type CallDoctor = {
  id: string;
  routeId: string;
  name: string;
  address: string;
  specialty: string;
  clinicName?: string | null;
  phone?: string | null;
  location: GeoPoint | null;
  photoUrl?: string | null;
  visitFrequency?: number | null;
  /** Who a team doctor is assigned to, "Name (code)". Not set on the employee's own doctors. */
  mrLabel?: string | null;
};

const noTeam = async (): Promise<TeamDoctor[]> => [];

/**
 * The doctors for the plan picker and the call screens (docs/mobile/dailyplan.md M4, dcr.md rule 1). The snapshot holds only the
 * employee's own, so a manager's team doctors are read from `doctors/team` and a copy is kept on the phone, which lets a manager
 * record a call on them offline once the list has loaded. Each screen re-reads it when it opens online, so a doctor moved off
 * the team drops out (doctors.md D1).
 */
export function useCallDoctors() {
  const { isManager } = useCurrentUser();
  const master = useCachedSource<FieldMasterDataSnapshot>('fieldMasterData');
  const team = useCachedFetch<TeamDoctor[]>(isManager ? 'team-doctors' : 'team-doctors:none', isManager ? listAllTeamDoctors : noTeam);

  const doctors = useMemo<CallDoctor[]>(() => {
    const own: CallDoctor[] = master.data?.doctors ?? [];
    const ownIds = new Set(own.map((d) => d.id));
    const below = (team.data ?? [])
      .filter((t) => !ownIds.has(t.id))
      .map<CallDoctor>((t) => ({ ...t, mrLabel: t.assignedTo ? `${t.assignedTo.name} (${t.assignedTo.employeeCode})` : null }));
    return [...own, ...below];
  }, [master.data, team.data]);
  const byId = useMemo(() => new Map(doctors.map((d) => [d.id, d])), [doctors]);

  return {
    isManager,
    doctors,
    byId,
    /** A manager's team list has never reached this phone, so their team's doctors can't be shown yet. */
    teamMissing: isManager && !team.loading && team.data === null,
  };
}
