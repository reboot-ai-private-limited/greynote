import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { UserFilterBanner, useUserFilter } from '@/components/team/user-filter';
import { DateStepper } from '@/components/date-stepper';
import { Notice } from '@/components/notice';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Avatar, InfoCard, Pill, SummaryStrip } from '@/components/ui-cards';
import { Spacing, type Accent } from '@/constants/theme';
import { useDayGate } from '@/hooks/use-day-gate';
import { doctorCountText, routeCountText } from '@/lib/planning';
import { getTeamPlans, type TeamPlans, type TeamScopeFilter } from '@/lib/team-section';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { prettyDay, prettyMonth } from '@/offline/day';

const SCOPES: { value: TeamScopeFilter; label: string }[] = [
  { value: 'all', label: 'All my team' },
  { value: 'direct', label: 'My direct reports' },
  { value: 'indirect', label: 'Their teams' },
];

const STATUS_ACCENT: Record<string, Accent> = { APPROVED: 'green', SUBMITTED: 'amber', MANAGER_APPROVED: 'blue', REJECTED: 'red', DRAFT: 'slate', WITHDRAWN: 'slate', REOPENED: 'slate' };
const label = (s: string) => s.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/**
 * Team → Plans (docs/mobile/team.md): each person's Daily Plan for any day, tomorrow included, and where their Monthly Plan
 * stands. A way to chase people before the day, not a place to approve (that is the Team tab's list). Needs a connection.
 */
export default function TeamPlansScreen() {
  const online = useOnline();
  const { today } = useDayGate();
  const [date, setDate] = useState<string | null>(null);
  const day = date ?? today;
  const [scope, setScope] = useState<TeamScopeFilter>('all');
  const [status, setStatus] = useState<string>('ALL');

  const { userId, clear } = useUserFilter();
  const list = useCachedFetch<TeamPlans>(`team-plans:${day}:${scope}:${status}:${userId ?? ''}`, () => getTeamPlans({ date: day, scope, userId, planStatus: status === 'ALL' ? undefined : status }));
  const data = list.data;
  const statuses = Object.keys(data?.counts ?? {}).filter((k) => (data?.counts[k] ?? 0) > 0);

  return (
    <ScreenShell title="Team plans" subtitle={prettyDay(day)} onRefresh={list.reload} refreshing={list.refreshing}>
      <UserFilterBanner userId={userId} onClear={clear} />
      <DateStepper label="Day" value={day} onChange={setDate} />
      {userId ? null : <ChoiceChips options={SCOPES} value={scope} onChange={setScope} />}
      {!online ? <Notice tone="info">You’re offline. Connect to see your team’s plans.</Notice> : null}
      {list.error && online ? <Notice tone="danger">{list.error}</Notice> : null}
      {list.loading && !data ? <Skeleton cards={3} lines={2} /> : null}

      {data ? (
        <>
          <SummaryStrip
            items={[
              { label: 'Approved', value: data.counts.APPROVED ?? 0, accent: 'green' },
              { label: 'Waiting', value: (data.counts.SUBMITTED ?? 0) + (data.counts.MANAGER_APPROVED ?? 0), accent: 'amber' },
              { label: 'No plan', value: data.counts.NONE ?? 0, accent: (data.counts.NONE ?? 0) > 0 ? 'red' : 'slate' },
            ]}
          />
          {statuses.length > 0 ? (
            <ChoiceChips options={[{ value: 'ALL', label: 'All' }, ...statuses.map((s) => ({ value: s, label: s === 'NONE' ? 'No plan' : label(s) }))]} value={status} onChange={setStatus} />
          ) : null}
        </>
      ) : null}
      {data && data.items.length === 0 ? <Notice tone="info">No one to show.</Notice> : null}

      {(data?.items ?? []).map((r) => (
        <InfoCard key={r.user.id}>
          <View style={styles.row}>
            <Avatar name={r.user.name} accent={r.dailyPlan ? (STATUS_ACCENT[r.dailyPlan.status] ?? 'slate') : 'red'} size={40} />
            <View style={styles.grow}>
              <ThemedText type="smallBold" numberOfLines={1}>{`${r.user.name} · ${r.user.employeeCode}`}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {r.dailyPlan ? `${label(r.dailyPlan.workingType)} · ${routeCountText(r.dailyPlan.routeCount, r.dailyPlan.routes)}, ${doctorCountText(r.dailyPlan.doctorCount)}` : 'No daily plan for this day'}
              </ThemedText>
            </View>
            {r.dailyPlan ? <Pill text={label(r.dailyPlan.status)} accent={STATUS_ACCENT[r.dailyPlan.status] ?? 'slate'} /> : <Pill text="No plan" accent="red" />}
          </View>
          {r.dailyPlan?.changedFromMonthly ? <Pill text="Changed from monthly" accent="amber" /> : null}
          <ThemedText type="small" themeColor="textSecondary">{`Tour plan ${prettyMonth(data?.month ?? day.slice(0, 7))}: ${r.monthlyPlanStatus ? label(r.monthlyPlanStatus) : 'none'}`}</ThemedText>
          <ThemedText type="small" themeColor="primary" onPress={() => router.push({ pathname: '/team-member', params: { id: r.user.id } })}>
            View person →
          </ThemedText>
        </InfoCard>
      ))}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1, gap: 2 },
});
