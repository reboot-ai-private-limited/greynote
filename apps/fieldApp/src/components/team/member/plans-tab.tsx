import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useFinancialYear } from '@/lib/financial-year';
import { dailyPlanChip, getTeamMemberDays, reportChip, type TeamMemberDay, type TeamMemberDays } from '@/lib/team-section';
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
import { PrimaryButton } from '../../primary-button';
import { DoctorLines } from '../doctor-lines';
import { TourPlanCard } from './tour-plan-card';

type Filter = 'ALL' | 'APPROVED' | 'WAITING' | 'OTHER';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'WAITING', label: 'Waiting' },
  { value: 'OTHER', label: 'Sent back' },
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
  const [showDrafts, setShowDrafts] = useState(false);
  const data = days.data;
  const all = (data?.items ?? []).filter((d) => d.plan !== null);
  const drafts = all.filter((d) => d.plan!.status === 'DRAFT');
  const rows = all.filter((d) => d.plan!.status !== 'DRAFT' && (filter === 'ALL' || group(d.plan!.status) === filter));
  const { visible } = useWindowed(rows, `${userId}|${month}|${filter}`);
  return (
    <View style={styles.stack}>
      <TourPlanCard userId={userId} month={month} name={person.name} employeeCode={person.employeeCode} designation={person.designation} />
      <ThemedText type="smallBold">Daily plans</ThemedText>
      <ChoiceChips options={FILTERS} value={filter} onChange={setFilter} />
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
      {drafts.length > 0 ? (
        <>
          <PrimaryButton label={showDrafts ? `Hide days not sent yet (${drafts.length}) ▴` : `Days not sent yet (${drafts.length}) ▾`} variant="text" onPress={() => setShowDrafts((x) => !x)} style={styles.link} />
          {showDrafts
            ? drafts.map((d) => (
                <InfoCard key={d.date}>
                  <ThemedText type="smallBold">{prettyDay(d.date)}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">{`Tour Plan: ${d.plan!.routes.map((r) => r.name).join(', ') || d.plan!.workingType.replace(/_/g, ' ').toLowerCase()}. The person has not sent this day’s Daily Plan.`}</ThemedText>
                </InfoCard>
              ))
            : null}
        </>
      ) : null}
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
  link: { alignSelf: 'flex-start' },
});
