'use client';

import type { BulkAssignResultDto, ChemistDto, DistributorDto, DoctorDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { chemistsApi, distributorsApi, doctorsApi, bulkAssignApi } from '@/lib/api/endpoints/fieldMasterData';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

export type PickerKind = 'doctors' | 'chemists' | 'distributors';

export interface PickerRow {
  id: string;
  name: string;
  /** The route or place, or the clinic: what tells two people of one name apart. */
  detail: string;
  holders: { userId: string; name: string; employeeCode: string }[];
}

/**
 * One page of what an employee could be given (the picker on their page): active records on the routes they hold, or all of them when `onlyTheirs` is off.
 * Distributors have no route filter on their own, so `onlyTheirs` there means "covering where they work".
 */
export function useAssignCandidates(kind: PickerKind, params: { employeeId: string; search: string; page: number; onlyTheirs: boolean; routeLabel: (id: string) => string }) {
  const { employeeId, search, page, onlyTheirs, routeLabel } = params;
  const query = { page, pageSize: 10, status: 'active' as const, ...(search && { search }), ...(onlyTheirs && { eligibleFor: employeeId }) };
  return useQuery(
    authedQueryOptions({
      queryKey: [...keys.doctors.all(), 'assign-candidates', kind, query],
      fetch: async (token, signal) => {
        if (kind === 'doctors') {
          const r = await doctorsApi.list(token, query, signal);
          return { ...r, items: r.items.map((d: DoctorDto): PickerRow => ({ id: d.id, name: d.name, detail: [routeLabel(d.routeId), d.clinicName].filter(Boolean).join(' · '), holders: d.assignedTo ? [d.assignedTo] : [] })) };
        }
        if (kind === 'chemists') {
          const r = await chemistsApi.list(token, query, signal);
          return { ...r, items: r.items.map((c: ChemistDto): PickerRow => ({ id: c.id, name: c.name, detail: [routeLabel(c.routeId), c.address].filter(Boolean).join(' · '), holders: c.assignedTo ?? [] })) };
        }
        const r = await distributorsApi.list(token, query, signal);
        return { ...r, items: r.items.map((d: DistributorDto): PickerRow => ({ id: d.id, name: d.name, detail: [d.gstNumber, d.contactPerson].filter(Boolean).join(' · '), holders: d.assignedTo ?? [] })) };
      },
      staleTime: staleTime.live,
    }),
  );
}

export function useBulkAssign(kind: PickerKind, onDone: (results: BulkAssignResultDto[]) => void) {
  return useApiMutation<{ userId: string; ids: string[]; removeIds: string[] }, BulkAssignResultDto[]>({
    call: (token, body) => bulkAssignApi.assign(token, kind, body),
    invalidates: [keys.doctors.all(), keys.chemists.all(), keys.distributors.all()],
    onSuccess: onDone,
  });
}
