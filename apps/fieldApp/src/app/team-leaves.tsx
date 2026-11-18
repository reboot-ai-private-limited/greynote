import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FyBanner } from '@/components/fy-banner';
import { MonthStepper } from '@/components/month-stepper';
import { Notice } from '@/components/notice';
import { ScreenShell } from '@/components/screen-shell';
import { SelectField } from '@/components/select-field';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Avatar, InfoCard, Pill } from '@/components/ui-cards';
import { Spacing, type Accent } from '@/constants/theme';
import { useFinancialYear } from '@/lib/financial-year';
import { getTeamLeaves, type TeamLeave } from '@/lib/team-section';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { datesInMonth, monthOf, prettyDay } from '@/offline/day';

const STATUS: Record<TeamLeave['status'], { text: string; accent: Accent }> = {
  SUBMITTED: { text: 'Waiting', accent: 'amber' },
  MANAGER_APPROVED: { text: 'Manager approved', accent: 'blue' },
  APPROVED: { text: 'Approved', accent: 'green' },
};

type Show = 'ALL' | 'WAITING' | 'APPROVED';
const SHOW: { value: Show; label: string }[] = [
  { value: 'ALL', label: 'All requests' },
  { value: 'WAITING', label: 'Waiting' },
  { value: 'APPROVED', label: 'Approved' },
];

/**
 * Team → Leave requests (docs/mobile/team.md): the leave your team asked for in a month, waiting ones first. Rejected and withdrawn are left out.
 * Read only; a direct report's waiting request is decided in Approvals.
 */
export default function TeamLeavesScreen() {
  const online = useOnline();
  const fy = useFinancialYear();
  const lastMonth = fy.isPast ? fy.lastMonth : monthOf(fy.today);
  const [picked, setMonth] = useState<string | null>(null);
  const month = picked && picked >= fy.firstMonth && picked <= fy.lastMonth ? picked : lastMonth;
  const [show, setShow] = useState<Show>('ALL');

  const days = datesInMonth(month);
  const from = days[0]!;
  const to = days[days.length - 1]!;
  const list = useCachedFetch<{ from: string; to: string; items: TeamLeave[] }>(`team-leaves:${fy.year}:${month}`, () => getTeamLeaves({ from, to, scope: 'all' }));
  const waiting = (l: TeamLeave) => l.status === 'SUBMITTED';
  const items = [...(list.data?.items ?? [])]
    .filter((l) => (show === 'ALL' ? true : show === 'WAITING' ? waiting(l) : !waiting(l)))
    .sort((a, b) => Number(waiting(b)) - Number(waiting(a)) || a.startDate.localeCompare(b.startDate));

  return (
    <ScreenShell title="Leave requests" subtitle="What your team has asked for" onRefresh={list.reload} refreshing={list.refreshing}>
      <FyBanner />
      <MonthStepper value={month} onChange={setMonth} min={fy.firstMonth} max={fy.lastMonth} />
      <View style={styles.filters}>
        <SelectField label="Show" options={SHOW} value={show} onChange={setShow} />
      </View>
      {!online ? <Notice tone="info">You’re offline. Connect to see your team’s leave.</Notice> : null}
      {list.error && online ? <Notice tone="danger">{list.error}</Notice> : null}
      {list.loading && !list.data ? <Skeleton cards={3} lines={2} /> : null}
      {list.data && items.length === 0 ? <Notice tone="info">{show === 'ALL' ? 'No leave requests this month.' : 'Nothing matches.'}</Notice> : null}
      {list.data && items.length > 0 ? <ThemedText type="small" themeColor="textSecondary">{`Total ${items.length}`}</ThemedText> : null}
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
          {waiting(l) && l.user.depth === 1 ? (
            <ThemedText type="small" themeColor="primary" onPress={() => router.push('/(tabs)/team')}>
              Decide in Approvals →
            </ThemedText>
          ) : null}
        </InfoCard>
      ))}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1, gap: 2 },
});
