import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useFinancialYear } from '@/lib/financial-year';
import { getStockCounts, STOCK_COUNT_STATUS_ACCENT, STOCK_COUNT_STATUS_TEXT, type StockCountsMonth } from '@/lib/stock-counts';
import { router } from 'expo-router';
import { dailyPlanChip, getTeamMemberDays, reportChip, type TeamMemberDay, type TeamMemberDays } from '@/lib/team-section';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { prettyDay } from '@/offline/day';
import { useWindowed } from '@/hooks/use-windowed';

import { SelectField } from '../../select-field';
import { Notice } from '../../notice';
import { NumberedRow } from '../../numbered-row';
import { PrimaryButton } from '../../primary-button';
import { Skeleton } from '../../skeleton';
import { ThemedText } from '../../themed-text';
import { InfoCard, Pill } from '../../ui-cards';
import { StockCountsCard } from '../../stock-counts-card';
import { DoctorLines } from '../doctor-lines';
import { TourPlanCard } from './tour-plan-card';

type Filter = 'ALL' | 'APPROVED' | 'WAITING' | 'OTHER';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'WAITING', label: 'Waiting' },
  { value: 'OTHER', label: 'Sent back or reopened' },
];
const group = (s: string | undefined): Filter => (s === 'APPROVED' || s === 'MANAGER_APPROVED' ? 'APPROVED' : s === 'SUBMITTED' ? 'WAITING' : 'OTHER');

/** The person's month, day by day: the Daily Plan (routes and doctors by name, remarks, status) and, under it, what was done. Newest first. */
export function usePersonDays(userId: string, month: string) {
  const fy = useFinancialYear();
  return useCachedFetch<TeamMemberDays>(`team-member-days:${fy.year}:${userId}:${month}`, () => getTeamMemberDays(userId, month));
}


export type Person = { name: string; employeeCode: string; designation: string | null };

/** The Tour Plan (the month) with its download, then the Daily Plans that were sent (waiting, approved, sent back). A draft is only what the Tour Plan wrote, so drafts are folded under one line. */
export function PlansTab({ userId, month, person }: { userId: string; month: string; person: Person }) {
  const online = useOnline();
  const days = usePersonDays(userId, month);
  const [filter, setFilter] = useState<Filter>('ALL');
  const data = days.data;
  const all = (data?.items ?? []).filter((d) => d.plan !== null);
  const rows = all.filter((d) => d.plan!.status !== 'DRAFT' && (filter === 'ALL' || group(d.plan!.status) === filter));
  const { visible } = useWindowed(rows, `${userId}|${month}|${filter}`);
  return (
    <View style={styles.stack}>
      <TourPlanCard userId={userId} month={month} name={person.name} employeeCode={person.employeeCode} designation={person.designation} />
      <ThemedText type="smallBold">Daily plans</ThemedText>
      <SelectField label="Show daily plans" options={FILTERS} value={filter} onChange={setFilter} />
      {!online && !data ? <Notice tone="info">Connect to see this person’s plans.</Notice> : null}
      {days.error && online ? <Notice tone="danger">{days.error}</Notice> : null}
      {days.loading && !data ? <Skeleton cards={3} lines={3} /> : null}
      {data && rows.length === 0 ? <Notice tone="info">No daily plan has been sent for this month.</Notice> : null}
      {data ? <ThemedText type="small" themeColor="textSecondary">{`Total ${rows.length}`}</ThemedText> : null}
      {visible.map((d, i) => (
        <NumberedRow key={d.date} n={i + 1}>
          <DayPlanCard day={d} />
        </NumberedRow>
      ))}
    </View>
  );
}

function DayPlanCard({ day }: { day: TeamMemberDay }) {
  const plan = day.plan!;
  const chip = dailyPlanChip(plan);
  const field = !['MEETING', 'CONFERENCE', 'STRIKE'].includes(plan.workingType);
  const past = day.summary.missed > 0 || day.report !== null;
  return (
    <InfoCard>
      <View style={styles.head}>
        <ThemedText type="smallBold" style={styles.grow}>{prettyDay(day.date)}</ThemedText>
        {chip ? <Pill text={chip.text} accent={chip.accent} /> : null}
      </View>
      <ThemedText type="small">{field ? (plan.routes.length > 0 ? plan.routes.map((r) => r.name).join(', ') : 'No route') : plan.workingType.replace(/_/g, ' ').toLowerCase()}</ThemedText>
      {plan.workWith.length > 0 ? <ThemedText type="small" themeColor="textSecondary">{`With ${plan.workWith.map((p) => p.label).join(', ')}`}</ThemedText> : null}
      {plan.remarks ? <ThemedText type="small" themeColor="textSecondary">{`“${plan.remarks}”`}</ThemedText> : null}
      {plan.changedFromMonthly ? <ThemedText type="small" themeColor="warning">Changed from the Tour Plan</ThemedText> : null}
      {field ? <DoctorLines planned={day.doctors.planned} alsoVisited={day.doctors.alsoVisited} past={past} /> : null}
    </InfoCard>
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
            </InfoCard>
          </NumberedRow>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1 },
});
