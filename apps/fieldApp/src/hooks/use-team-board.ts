import { useMemo } from 'react';

import { useDayGate } from '@/hooks/use-day-gate';
import { getAllTeamToday, listAllTeamMembers, type TeamToday } from '@/lib/team-section';
import { buildTeamTree } from '@/lib/team-tree';
import { useCachedFetch } from '@/offline/cached-fetch';

/**
 * The manager's whole team with today's state for each person, as a tree with a roll-up per manager. Two reads (the roster and the
 * day), each paged through to the end; the last copy of both stays on the phone for offline.
 */
export function useTeamBoard() {
  const { today } = useDayGate();
  const roster = useCachedFetch('team-roster-all', listAllTeamMembers);
  const day = useCachedFetch<TeamToday>(`team-day-all:${today}`, () => getAllTeamToday({ date: today }));

  const tree = useMemo(() => buildTeamTree(roster.data?.items ?? [], day.data?.items ?? []), [roster.data, day.data]);

  return {
    today,
    roots: tree.roots,
    byId: tree.byId,
    tiles: day.data?.tiles ?? null,
    notStartedAfter: day.data?.notStartedAfter ?? null,
    count: roster.data?.total ?? 0,
    loading: (roster.loading && !roster.data) || (day.loading && !day.data),
    refreshing: roster.refreshing || day.refreshing,
    error: roster.error ?? day.error,
    stale: roster.stale && day.stale,
    fetchedAt: day.fetchedAt ?? roster.fetchedAt,
    reload: () => {
      roster.reload();
      day.reload();
    },
  };
}
