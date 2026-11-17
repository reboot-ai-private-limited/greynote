import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useFinancialYear } from '@/lib/financial-year';
import { getTeamMemberDays, planChip, reportChip, type TeamMemberDay, type TeamMemberDays } from '@/lib/team-section';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { prettyDay } from '@/offline/day';
import { useWindowed } from '@/hooks/use-windowed';

import { ChoiceChips } from '../../choice-chips';
import { Notice } from '../../notice';
import { NumberedRow } from '../../numbered-row';
import { Skeleton } from '../../skeleton';
import { ThemedText } from '../../themed-text';
import { InfoCard, Pill } from '../../ui-cards';
import { DoctorLines } from '../doctor-lines';

type Filter = 'ALL' | 'APPROVED' | 'WAITING' | 'OTHER';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'WAITING', label: 'Waiting' },
  { value: 'OTHER', label: 'Not sent / sent back' },
];
const group = (s: string | undefined): Filter => (s === 'APPROVED' || s === 'MANAGER_APPROVED' ? 'APPROVED' : s === 'SUBMITTED' ? 'WAITING' : 'OTHER');

/** The person's month, day by day: the Daily Plan (routes and doctors by name, remarks, status) and, under it, what was done. Newest first. */
export function usePersonDays(userId: string, month: string) {
  const fy = useFinancialYear();
  return useCachedFetch<TeamMemberDays>(`team-member-days:${fy.year}:${userId}:${month}`, () => getTeamMemberDays(userId, month));
}

const TOUR_TEXT: Record<string, string> = {
  APPROVED: 'Approved',
  MANAGER_APPROVED: 'Approved',
  SUBMITTED: 'Waiting for approval',
  DRAFT: 'Draft, not sent',
  REJECTED: 'Sent back',
  WITHDRAWN: 'Withdrawn',
  REOPENED: 'Reopened',
};

export function PlansTab({ userId, month }: { userId: string; month: string }) {
  const online = useOnline();
  const days = usePersonDays(userId, month);
  const [filter, setFilter] = useState<Filter>('ALL');
  const data = days.data;
  const rows = (data?.items ?? []).filter((d) => d.plan !== null && (filter === 'ALL' || group(d.plan.status) === filter));
  const { visible } = useWindowed(rows, `${userId}|${month}|${filter}`);
  return (
    <View style={styles.stack}>
      {data ? (
        <InfoCard>
          <View style={styles.head}>
            <ThemedText type="smallBold" style={styles.grow}>Tour Plan</ThemedText>
            <Pill text={data.monthlyPlanStatus ? (TOUR_TEXT[data.monthlyPlanStatus] ?? data.monthlyPlanStatus) : 'No Tour Plan'} accent={group(data.monthlyPlanStatus ?? undefined) === 'APPROVED' ? 'green' : data.monthlyPlanStatus ? 'amber' : 'slate'} />
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {group(data.monthlyPlanStatus ?? undefined) === 'APPROVED' ? 'The days below are the approved plan, as the person changed them each day.' : 'The Tour Plan is not approved yet, so the days below are only what the person sent or saved.'}
          </ThemedText>
        </InfoCard>
      ) : null}
      <ChoiceChips options={FILTERS} value={filter} onChange={setFilter} />
      {!online && !data ? <Notice tone="info">Connect to see this person’s plans.</Notice> : null}
      {days.error && online ? <Notice tone="danger">{days.error}</Notice> : null}
      {days.loading && !data ? <Skeleton cards={3} lines={3} /> : null}
      {data && rows.length === 0 ? <Notice tone="info">No daily plans for this month.</Notice> : null}
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
  const chip = planChip(plan.status);
  const field = !['MEETING', 'CONFERENCE', 'STRIKE'].includes(plan.workingType);
  const past = day.summary.missed > 0 || day.report !== null;
  return (
    <InfoCard>
      <View style={styles.head}>
        <ThemedText type="smallBold" style={styles.grow}>{prettyDay(day.date)}</ThemedText>
        <Pill text={chip.text} accent={chip.accent} />
      </View>
      <ThemedText type="small">{field ? (plan.routes.length > 0 ? plan.routes.map((r) => r.name).join(', ') : 'No route') : plan.workingType.replace(/_/g, ' ').toLowerCase()}</ThemedText>
      {plan.workWith.length > 0 ? <ThemedText type="small" themeColor="textSecondary">{`With ${plan.workWith.map((p) => p.label).join(', ')}`}</ThemedText> : null}
      {plan.remarks ? <ThemedText type="small" themeColor="textSecondary">{`“${plan.remarks}”`}</ThemedText> : null}
      {plan.changedFromMonthly ? <ThemedText type="small" themeColor="warning">Changed from the Tour Plan</ThemedText> : null}
      {field ? <DoctorLines planned={day.doctors.planned} alsoVisited={day.doctors.alsoVisited} past={past} /> : null}
    </InfoCard>
  );
}

/** The person's daily reports, one row per day with its status and what it holds. */
export function ReportsTab({ userId, month }: { userId: string; month: string }) {
  const online = useOnline();
  const days = usePersonDays(userId, month);
  const data = days.data;
  const rows = (data?.items ?? []).filter((d) => d.report !== null);
  const { visible } = useWindowed(rows, `${userId}|${month}`);
  return (
    <View style={styles.stack}>
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
                <ThemedText type="smallBold" style={styles.grow}>{prettyDay(d.date)}</ThemedText>
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
