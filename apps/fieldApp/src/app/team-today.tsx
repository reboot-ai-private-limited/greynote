import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { DateStepper } from '@/components/date-stepper';
import { Notice } from '@/components/notice';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Avatar, InfoCard, Pill, SummaryStrip } from '@/components/ui-cards';
import { Spacing, type Accent } from '@/constants/theme';
import { useDayGate } from '@/hooks/use-day-gate';
import { doctorCountText, routeCountText } from '@/lib/planning';
import { DAY_STATE_TEXT, getTeamToday, useApprovalSummary, type DayState, type TeamScopeFilter, type TeamToday } from '@/lib/team-section';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { prettyDay } from '@/offline/day';

const STATE_ACCENT: Record<DayState, Accent> = {
  REPORTED: 'green',
  WORKING: 'blue',
  NOT_YET: 'slate',
  NOT_STARTED: 'red',
  MISSED: 'red',
  ON_LEAVE: 'purple',
  OFF: 'slate',
};

const SCOPES: { value: TeamScopeFilter; label: string }[] = [
  { value: 'all', label: 'All my team' },
  { value: 'direct', label: 'My direct reports' },
  { value: 'indirect', label: 'Their teams' },
];

type Focus = 'ALL' | 'ATTENTION';

/**
 * Team → Today (docs/mobile/team.md): each person's day at a glance, the ones that need you first. Today or an earlier day.
 * The tiles count the whole level whatever the filter. "Not started" uses the Admin's not-started time. Needs a connection.
 */
export default function TeamTodayScreen() {
  const online = useOnline();
  const { today } = useDayGate();
  const [date, setDate] = useState<string | null>(null);
  const day = date ?? today;
  const [scope, setScope] = useState<TeamScopeFilter>('all');
  const [focus, setFocus] = useState<Focus>('ALL');

  const list = useCachedFetch<TeamToday>(`team-today:${day}:${scope}:${focus}`, () => getTeamToday({ date: day, scope, attention: focus === 'ATTENTION' ? true : undefined }));
  const data = list.data;
  const t = data?.tiles;
  // The approvals waiting on me today, whichever day is shown below.
  const pending = useApprovalSummary();

  return (
    <ScreenShell title="Team today" subtitle={prettyDay(day)} onRefresh={list.reload} refreshing={list.refreshing}>
      <DateStepper label="Day" value={day} onChange={(d) => setDate(d > today ? today : d)} disabled={false} />
      {!online ? <Notice tone="info">You’re offline. Connect to see your team’s day.</Notice> : null}
      {list.error && online ? <Notice tone="danger">{list.error}</Notice> : null}
      {list.loading && !data ? <Skeleton cards={3} lines={2} /> : null}

      {t ? (
        <SummaryStrip
          items={[
            // What the team doc suggests: what waits on me, who has not started, who is away, who is blocked.
            { label: 'Pending approvals', value: pending.summary ? pending.summary.total : '–', accent: pending.summary && pending.summary.total > 0 ? 'amber' : 'slate' },
            { label: 'Not started', value: t.NOT_STARTED ?? 0, accent: (t.NOT_STARTED ?? 0) > 0 ? 'red' : 'slate' },
            { label: 'On leave', value: t.ON_LEAVE ?? 0, accent: (t.ON_LEAVE ?? 0) > 0 ? 'purple' : 'slate' },
            { label: 'Blocked', value: t.blocked, accent: t.blocked > 0 ? 'red' : 'slate' },
          ]}
        />
      ) : null}

      <ChoiceChips options={SCOPES} value={scope} onChange={setScope} />
      <ChoiceChips
        options={[{ value: 'ALL' as const, label: 'All' }, { value: 'ATTENTION' as const, label: 'Needs attention' }]}
        value={focus}
        onChange={setFocus}
      />

      {data && data.items.length === 0 ? <Notice tone="info">{focus === 'ATTENTION' ? 'Nobody needs attention.' : 'No one to show for this level.'}</Notice> : null}
      {(data?.items ?? []).map((r) => (
        <InfoCard key={r.user.id}>
          <View style={styles.row}>
            <Avatar name={r.user.name} accent={STATE_ACCENT[r.state]} size={40} />
            <View style={styles.grow}>
              <ThemedText type="smallBold" numberOfLines={1}>{`${r.user.name} · ${r.user.employeeCode}`}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {r.plan ? `${r.plan.workingType.replace(/_/g, ' ').toLowerCase()} · ${routeCountText(r.plan.routeCount, r.plan.routes)}, ${doctorCountText(r.plan.doctorCount)}` : 'No daily plan'}
              </ThemedText>
            </View>
            <Pill text={DAY_STATE_TEXT[r.state]} accent={STATE_ACCENT[r.state]} />
          </View>
          {r.dcr ? (
            <ThemedText type="small" themeColor="textSecondary">{`${r.dcr.doctorCalls} doctor, ${r.dcr.chemistCalls} chemist calls · ${r.dcr.followups} follow-ups · report ${r.dcr.status.toLowerCase().replace(/_/g, ' ')}`}</ThemedText>
          ) : null}
          {r.leave ? <ThemedText type="small" themeColor="textSecondary">{`${r.leave.leaveType ?? 'Leave'} · ${r.leave.status.toLowerCase().replace(/_/g, ' ')}`}</ThemedText> : null}
          <View style={styles.flags}>
            {r.blocked ? <Pill text="Blocked" accent="red" /> : null}
            {r.attention && !r.blocked ? <Pill text="Needs attention" accent="amber" /> : null}
          </View>
          <ThemedText type="small" themeColor="primary" onPress={() => router.push({ pathname: '/team-member', params: { id: r.user.id } })}>
            View person →
          </ThemedText>
        </InfoCard>
      ))}
      {data ? <ThemedText type="small" themeColor="textSecondary">{`“Not started” is counted after ${data.notStartedAfter}.`}</ThemedText> : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1, gap: 2 },
  flags: { flexDirection: 'row', gap: Spacing.two },
});
