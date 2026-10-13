import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { UserFilterBanner, useUserFilter } from '@/components/team/user-filter';
import { MonthStepper } from '@/components/month-stepper';
import { Notice } from '@/components/notice';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Avatar, InfoCard, Pill, SummaryStrip } from '@/components/ui-cards';
import { Spacing, type Accent } from '@/constants/theme';
import { useFinancialYear } from '@/lib/financial-year';
import { getTeamLeaves, type TeamLeave, type TeamScopeFilter } from '@/lib/team-section';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { datesInMonth, monthOf, prettyDay } from '@/offline/day';

const SCOPES: { value: TeamScopeFilter; label: string }[] = [
  { value: 'all', label: 'All my team' },
  { value: 'direct', label: 'My direct reports' },
  { value: 'indirect', label: 'Their teams' },
];

const STATUS: Record<TeamLeave['status'], { text: string; accent: Accent }> = {
  SUBMITTED: { text: 'Waiting', accent: 'amber' },
  MANAGER_APPROVED: { text: 'Manager approved', accent: 'blue' },
  APPROVED: { text: 'Approved', accent: 'green' },
};

/**
 * Team → Leave calendar (docs/mobile/team.md): who is on leave in a month: waiting, manager-approved or approved leave
 * (rejected and withdrawn are left out). A calendar to plan around, not the decision queue (that is the Team tab's list).
 */
export default function TeamLeavesScreen() {
  const online = useOnline();
  const fy = useFinancialYear();
  const lastMonth = fy.isPast ? fy.lastMonth : monthOf(fy.today);
  const [picked, setMonth] = useState<string | null>(null);
  const month = picked && picked >= fy.firstMonth && picked <= fy.lastMonth ? picked : lastMonth;
  const [scope, setScope] = useState<TeamScopeFilter>('all');

  const days = datesInMonth(month);
  const from = days[0]!;
  const to = days[days.length - 1]!;
  const { userId, clear } = useUserFilter();
  const list = useCachedFetch<{ from: string; to: string; items: TeamLeave[] }>(`team-leaves:${fy.year}:${month}:${scope}:${userId ?? ''}`, () => getTeamLeaves({ from, to, scope, userId }));
  const items = [...(list.data?.items ?? [])].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const count = (s: TeamLeave['status']) => items.filter((i) => i.status === s).length;

  return (
    <ScreenShell title="Leave calendar" subtitle="Who is away this month" onRefresh={list.reload} refreshing={list.refreshing}>
      <UserFilterBanner userId={userId} onClear={clear} />
      <MonthStepper value={month} onChange={setMonth} min={fy.firstMonth} max={fy.lastMonth} />
      {userId ? null : <ChoiceChips options={SCOPES} value={scope} onChange={setScope} />}
      {!online ? <Notice tone="info">You’re offline. Connect to see your team’s leave.</Notice> : null}
      {list.error && online ? <Notice tone="danger">{list.error}</Notice> : null}
      {list.loading && !list.data ? <Skeleton cards={3} lines={2} /> : null}
      {list.data ? (
        <SummaryStrip items={[{ label: 'Approved', value: count('APPROVED') + count('MANAGER_APPROVED'), accent: 'green' }, { label: 'Waiting', value: count('SUBMITTED'), accent: 'amber' }]} />
      ) : null}
      {list.data && items.length === 0 ? <Notice tone="info">Nobody is on leave this month.</Notice> : null}
      {items.map((l) => (
        <InfoCard key={l.leaveId}>
          <View style={styles.row}>
            <Avatar name={l.user.name} accent={STATUS[l.status].accent} size={40} />
            <View style={styles.grow}>
              <ThemedText type="smallBold" numberOfLines={1}>{`${l.user.name} · ${l.user.employeeCode}`}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {`${l.leaveType ?? 'Leave'} · ${l.startDate === l.endDate ? prettyDay(l.startDate) : `${prettyDay(l.startDate)} → ${prettyDay(l.endDate)}`} · ${l.daysCount} ${l.daysCount === 1 ? 'day' : 'days'}`}
              </ThemedText>
            </View>
            <Pill text={STATUS[l.status].text} accent={STATUS[l.status].accent} />
          </View>
        </InfoCard>
      ))}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1, gap: 2 },
});
