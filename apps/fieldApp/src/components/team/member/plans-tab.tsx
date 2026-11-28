import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useFinancialYear } from '@/lib/financial-year';
import { getTeamMemberDays, type TeamMemberDays } from '@/lib/team-section';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { useWindowed } from '@/hooks/use-windowed';

import { Notice } from '../../notice';
import { NumberedRow } from '../../numbered-row';
import { Skeleton } from '../../skeleton';
import { ThemedText } from '../../themed-text';
import { InfoCard } from '../../ui-cards';
import { DayLines } from './day-lines';
import { ReopenTourPlan } from './reopen-tour-plan';
import { tourWordsOn, useTourPlan } from './tour-plan-data';

/** The person's month, day by day: the Daily Plan (routes and doctors by name, remarks, status) and, under it, what was done. Newest first. */
export function usePersonDays(userId: string, month: string) {
  const fy = useFinancialYear();
  return useCachedFetch<TeamMemberDays>(`team-member-days:${fy.year}:${userId}:${month}`, () => getTeamMemberDays(userId, month));
}


export type Person = { name: string; employeeCode: string; designation: string | null };

/**
 * The person's month as day blocks, newest first, each in the same three lines as the page's header (Tour Plan, Daily plan, Daily report). The days are
 * the Tour Plan's and every day that has a Daily Plan or a report. The one Download for the month is on the page, above the tabs.
 */
export function PlansTab({ userId, month, personName, onOpenReport }: { userId: string; month: string; personName: string; onOpenReport: (date: string) => void }) {
  const online = useOnline();
  const today = useFinancialYear().effectiveToday;
  const days = usePersonDays(userId, month);
  const tour = useTourPlan(userId, month);
  const data = days.data;
  const byDate = new Map((data?.items ?? []).map((d) => [d.date, d]));
  const dates = [...new Set([...byDate.keys(), ...(tour.data?.entries ?? []).map((e) => e.planDate)])].sort().reverse();
  const { visible } = useWindowed(dates, `${userId}|${month}`);
  const loading = (days.loading && !data) || (tour.loading && tour.data === undefined);
  return (
    <View style={styles.stack}>
      {!online && !data ? <Notice tone="info">Connect to see this person’s plans.</Notice> : null}
      <ReopenTourPlan plan={tour.data ?? null} personName={personName} onDone={() => void tour.reload()} />
      {days.error && online ? <Notice tone="danger">{days.error}</Notice> : null}
      {loading ? <Skeleton cards={3} lines={3} /> : null}
      {data && dates.length === 0 ? <Notice tone="info">Nothing is planned or reported for this month.</Notice> : null}
      {data ? <ThemedText type="small" themeColor="textSecondary">{`Total ${dates.length} days`}</ThemedText> : null}
      {visible.map((date, i) => {
        const d = byDate.get(date);
        const plan = d?.plan ?? null;
        return (
          <NumberedRow key={date} n={i + 1}>
            <InfoCard>
              <DayLines
                date={date}
                showDate
                tourWords={tourWordsOn(tour.data, date)}
                tourStatus={data?.monthlyPlanStatus}
                plan={plan}
                deadlinePassed={date < today}
                doctors={d?.doctors ?? { planned: [], alsoVisited: [] }}
                report={d?.report ?? null}
                onOpenReport={() => onOpenReport(date)}
              />
            </InfoCard>
          </NumberedRow>
        );
      })}
    </View>
  );
}

/** The person's secondary sales for the month, as they sent it: status, the figures by distributor and product, the proof files. Read only; a month waiting for the viewer is decided in Approvals. */
const styles = StyleSheet.create({
  carry: { alignSelf: 'flex-start' },
  stack: { gap: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1 },
});
