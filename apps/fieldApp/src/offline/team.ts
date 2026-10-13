import { useEffect, useState } from 'react';

import { useCurrentUser } from '@/hooks/use-current-user';
import { useDayGate } from '@/hooks/use-day-gate';
import { getSalesDashboard } from '@/lib/team';
import { useSessionUser } from '@/lib/session';

import { isOnline } from './connectivity';
import { store } from './store';

/**
 * A manager's team: the active field employees below them. The backend has no "my team" list, but the sales dashboard
 * (`GET /reports/sales-dashboard`) has one row for each person in a manager's downline, so a one-day read of it is the roster.
 * Kept on the phone per employee so the pickers (late submissions, targets, team reports) work offline. Only managers
 * are asked: the server refuses the report to anyone without a team.
 */
export type TeamMember = { id: string; employeeCode: string; name: string; designation: string | null };

const KEY = (userId: string) => `team:${userId}`;
const listeners = new Set<() => void>();

async function loadCachedTeam(userId: string): Promise<TeamMember[]> {
  const raw = await store.getMeta(KEY(userId));
  if (!raw) return [];
  try {
    return JSON.parse(raw) as TeamMember[];
  } catch {
    return [];
  }
}

/** Fetches the roster and keeps it. A failure keeps what was cached. */
async function refreshTeam(userId: string, today: string): Promise<void> {
  if (!isOnline()) return;
  try {
    // A single day, outside the financial-year switch: it is the people that matter, not the figures.
    const dash = await getSalesDashboard(today, today, 100, { fy: false });
    const team = dash.rows
      .map((r) => ({ id: r.employee.id, employeeCode: r.employee.employeeCode, name: r.employee.name, designation: r.designation }))
      .sort((a, b) => a.name.localeCompare(b.name));
    await store.setMeta(KEY(userId), JSON.stringify(team));
    listeners.forEach((l) => l());
  } catch {
    // Offline, or the server is unreachable: the cached roster stays.
  }
}

/** The signed-in manager's team (empty for anyone else), refreshed each time a screen using it opens. */
export function useTeam(): { team: TeamMember[]; loaded: boolean } {
  const user = useSessionUser();
  const { isManager } = useCurrentUser();
  const { today } = useDayGate();
  const userId = user?.id ?? null;
  const [state, setState] = useState<{ userId: string | null; team: TeamMember[]; loaded: boolean }>({ userId: null, team: [], loaded: false });

  useEffect(() => {
    if (!userId || !isManager) return;
    let alive = true;
    const read = () =>
      loadCachedTeam(userId).then((team) => {
        if (alive) setState({ userId, team, loaded: true });
      });
    void read();
    listeners.add(read);
    void refreshTeam(userId, today);
    return () => {
      alive = false;
      listeners.delete(read);
    };
  }, [userId, isManager, today]);

  // Another employee's roster, or none yet, must never show as this one's.
  if (!userId || !isManager || state.userId !== userId) return { team: [], loaded: false };
  return { team: state.team, loaded: state.loaded };
}
