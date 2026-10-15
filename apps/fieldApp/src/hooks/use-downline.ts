import { useMemo } from 'react';

import { useCurrentUser } from '@/hooks/use-current-user';
import { listAllTeamMembers } from '@/lib/team-section';
import { useCachedFetch } from '@/offline/cached-fetch';
import type { Colleague } from '@/offline/colleagues';

/**
 * A manager's whole downline (any depth, active people only) as the Work With picker lists it. The server refuses anyone else
 * on a manager's Daily Plan (`400` on `workWith`). Kept on the phone, so it also works offline. Empty for
 * anyone who is not a manager; `loaded` is false until a copy (cached or fresh) has arrived.
 */
export function useDownline(): { people: Colleague[]; loaded: boolean } {
  const { isManager } = useCurrentUser();
  // Only a manager is allowed the roster (anyone else is refused), so for others the fetch is skipped; it runs again once the
  // phone learns the person is a manager.
  const roster = useCachedFetch('downline', () => (isManager ? listAllTeamMembers() : Promise.resolve(null)), isManager);
  const items = roster.data?.items;
  const people = useMemo<Colleague[]>(
    () =>
      (items ?? []).map((m) => ({
        id: m.id,
        employeeCode: m.employeeCode,
        name: m.name,
        designation: m.designation,
        label: m.designation ? `${m.name} (${m.designation})` : m.name,
        isManager: m.isManager,
        relation: 'TEAM' as const,
      })),
    [items],
  );
  if (!isManager) return { people: [], loaded: true };
  return { people, loaded: !roster.loading || roster.data !== null };
}
