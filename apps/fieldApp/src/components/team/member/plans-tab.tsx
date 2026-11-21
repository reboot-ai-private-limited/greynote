import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useFinancialYear } from '@/lib/financial-year';
import { getStockCounts, STOCK_COUNT_STATUS_ACCENT, STOCK_COUNT_STATUS_TEXT, type StockCountsMonth } from '@/lib/stock-counts';
import { router } from 'expo-router';
import { getTeamMemberDays, reportChip, type TeamMemberDays } from '@/lib/team-section';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { prettyDay } from '@/offline/day';
import { useWindowed } from '@/hooks/use-windowed';

import { Notice } from '../../notice';
import { NumberedRow } from '../../numbered-row';
import { PrimaryButton } from '../../primary-button';
import { Skeleton } from '../../skeleton';
import { ThemedText } from '../../themed-text';
import { InfoCard, Pill } from '../../ui-cards';
import { StockCountsCard } from '../../stock-counts-card';
import { DoctorLines } from '../doctor-lines';
import { DoctorsToday } from '../doctors-today';
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
function SecondaryMonth({ userId, month }: { userId: string; month: string }) {
  const online = useOnline();
  const fy = useFinancialYear();
  const counts = useCachedFetch<StockCountsMonth>(`secondary-stock:${fy.year}:${userId}:${month}`, () => getStockCounts(userId, month));
  const data = counts.data?.month === month ? counts.data : null;
  return (
    <InfoCard>
      <View style={styles.head}>
        <ThemedText type="smallBold" style={styles.grow}>Secondary sales</ThemedText>
        {data ? <Pill text={STOCK_COUNT_STATUS_TEXT[data.status]} accent={STOCK_COUNT_STATUS_ACCENT[data.status]} /> : null}
      </View>
      {!online && !data ? <Notice tone="info">Connect to see this month’s secondary sales.</Notice> : null}
      {counts.error && online ? <Notice tone="danger">{counts.error}</Notice> : null}
      {counts.loading && !data ? <Skeleton cards={1} lines={3} /> : null}
      {data && data.status === 'NOT_ENTERED' ? <ThemedText type="small" themeColor="textSecondary">Nothing entered for this month yet.</ThemedText> : null}
      {data && data.status !== 'NOT_ENTERED' ? <StockCountsCard data={data} /> : null}
      {data?.status === 'PENDING' ? <PrimaryButton label="Decide in Approvals →" variant="text" onPress={() => router.push('/(tabs)/team')} style={styles.grow} /> : null}
    </InfoCard>
  );
}

/** One line on a day's report: missed, carried in and carried on; tap for the doctors by name (the manager's "Doctors today" card). */
function DayCarry({ userId, date, carry }: { userId: string; date: string; carry: { carriedIn: number; missed: number; carriedOn: number; final: boolean } | null }) {
  const [open, setOpen] = useState(false);
  if (!carry || (carry.carriedIn === 0 && carry.missed === 0 && carry.carriedOn === 0)) return null;
  return (
    <>
      <PrimaryButton
        label={`${open ? '▴' : '▾'} Doctors: missed ${carry.missed} · carried in ${carry.carriedIn} · carried ${carry.final ? 'on' : 'on so far'} ${carry.carriedOn} — tap for names`}
        variant="text"
        onPress={() => setOpen((o) => !o)}
        style={styles.carry}
      />
      {open ? <DoctorsToday userId={userId} date={date} /> : null}
    </>
  );
}

/** The person's daily reports, one row per day with its status and what it holds. */
export function ReportsTab({ userId, month, focusDate }: { userId: string; month: string; focusDate?: string | null }) {
  const online = useOnline();
  const days = usePersonDays(userId, month);
  const data = days.data;
  const reported = (data?.items ?? []).filter((d) => d.report !== null);
  // The day opened from the header comes first, highlighted; the rest keep their order.
  const rows = focusDate ? [...reported.filter((d) => d.date === focusDate), ...reported.filter((d) => d.date !== focusDate)] : reported;
  const { visible } = useWindowed(rows, `${userId}|${month}|${focusDate ?? ''}`);
  return (
    <View style={styles.stack}>
      <SecondaryMonth userId={userId} month={month} />
      <ThemedText type="smallBold">Daily reports</ThemedText>
      {!online && !data ? <Notice tone="info">Connect to see this person’s reports.</Notice> : null}
      {days.error && online ? <Notice tone="danger">{days.error}</Notice> : null}
      {days.loading && !data ? <Skeleton cards={3} lines={3} /> : null}
      {data && rows.length === 0 ? <Notice tone="info">No daily reports for this month.</Notice> : null}
      {data ? <ThemedText type="small" themeColor="textSecondary">{`Total ${rows.length}`}</ThemedText> : null}
      {visible.map((d, i) => {
        const r = d.report!;
        const chip = reportChip(r.status);
        return (
          <NumberedRow key={d.date} n={i + 1}>
            <InfoCard>
              <View style={styles.head}>
                <ThemedText type="smallBold" style={styles.grow}>{d.date === focusDate ? `${prettyDay(d.date)} · Today` : prettyDay(d.date)}</ThemedText>
                <Pill text={chip.text} accent={chip.accent} />
              </View>
              <ThemedText type="small">{`${r.doctorCalls} doctor and ${r.chemistCalls} chemist calls · ${r.followups} follow-up${r.followups === 1 ? '' : 's'}`}</ThemedText>
              {d.summary.planned > 0 ? <ThemedText type="small" themeColor={d.summary.missed > 0 ? 'danger' : 'textSecondary'}>{`Visited ${d.summary.visited} of ${d.summary.planned} planned doctors${d.summary.missed > 0 ? `, ${d.summary.missed} missed` : ''}`}</ThemedText> : null}
              <DoctorLines planned={d.doctors.planned} alsoVisited={d.doctors.alsoVisited} past />
              <DayCarry userId={userId} date={d.date} carry={d.carry ?? null} />
            </InfoCard>
          </NumberedRow>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  carry: { alignSelf: 'flex-start' },
  stack: { gap: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1 },
});
