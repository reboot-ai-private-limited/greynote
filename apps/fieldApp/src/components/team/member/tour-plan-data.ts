import { useFinancialYear } from '@/lib/financial-year';
import { getTeamMemberTourPlan } from '@/lib/planning';
import { useCachedFetch } from '@/offline/cached-fetch';

type TourPlan = NonNullable<Awaited<ReturnType<typeof getTeamMemberTourPlan>>>;

/** A person's Tour Plan for a month, read live whatever its state; `null` = none, `undefined` = not loaded yet. */
export function useTourPlan(userId: string, month: string) {
  const fy = useFinancialYear();
  return useCachedFetch(`team-member-tourplan:${fy.year}:${userId}:${month}`, () => getTeamMemberTourPlan(userId, month));
}

/** What the Tour Plan says for one day, in words: the route names, or the work type (meeting, leave…); `null` when the plan has nothing for that day. */
export function tourWordsOn(plan: TourPlan | null | undefined, date: string): string | null {
  const entry = plan?.entries.find((e) => e.planDate === date);
  if (!entry) return null;
  const names = new Map((plan?.routes ?? []).map((r) => [r.id, r.name]));
  const field = entry.workingType === 'FIELD_WORK' || entry.workingType === 'DOCTOR_CAMPAIGN';
  const words = field ? (entry.routeIds.length > 0 ? entry.routeIds.map((id) => names.get(id) ?? 'Route').join(', ') : 'No route') : entry.workingType.replace(/_/g, ' ').toLowerCase();
  return entry.dayKind === 'STAY' ? `${words} · stay (trip)` : entry.dayKind === 'TRANSIT' ? `${words} · return (trip)` : words;
}
