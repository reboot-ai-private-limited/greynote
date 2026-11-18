import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MonthStepper } from '@/components/month-stepper';
import { Notice } from '@/components/notice';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { PlansTab, ReportsTab, usePersonDays } from '@/components/team/member/plans-tab';
import { ChoiceChips } from '@/components/choice-chips';
import { TodayHeader } from '@/components/team/member/today-header';
import { ChemistsTab, DistributorsTab, DoctorsTab, ExpensesTab, LeaveTab, OrdersTab } from '@/components/team/member/more-tabs';
import { ThemedText } from '@/components/themed-text';
import { Avatar, CardSection, InfoCard, Meter, Pill, SummaryStrip, sym } from '@/components/ui-cards';
import { Spacing, type Accent } from '@/constants/theme';
import { useDayGate } from '@/hooks/use-day-gate';
import { useFinancialYear } from '@/lib/financial-year';
import { formatRupees } from '@/lib/money';
import { NOT_IN_TEAM_TEXT, dailyPlanChip, getTeamDay, getTeamMemberSummary, type TeamBoard, type TeamMemberSummary } from '@/lib/team-section';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { monthOf, prettyMonth } from '@/offline/day';

/**
 * One person of your team (docs/mobile/team.md), as tabs: Overview, Plans, Reports and More (the rest of their records). The header says who they
 * are and how today looks; Unblock and late exceptions are on the Team board and in Team → Reports. A person outside your downline is refused (403).
 */
export default function TeamMemberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const online = useOnline();
  const fy = useFinancialYear();
  const lastMonth = fy.isPast ? fy.lastMonth : monthOf(fy.today);
  const clamp = (m: string) => (m < fy.firstMonth ? fy.firstMonth : m > lastMonth ? lastMonth : m);
  const [picked, setMonth] = useState<string | null>(null);
  const month = clamp(picked ?? lastMonth);
  const [tab, setTab] = useState<'overview' | 'plans' | 'reports' | 'expenses' | 'leave' | 'doctors' | 'chemists' | 'distributors' | 'orders'>('overview');
  // Set when the header's "Daily report: Yes" is tapped: that day's report is shown first in the Reports tab.
  const [focusDate, setFocusDate] = useState<string | null>(null);

  const { today } = useDayGate();
  const todayRow = useCachedFetch<TeamBoard>(`team-day-one:${fy.year}:${id}:${today}`, () => getTeamDay({ date: today, userId: String(id) }));
  const days = usePersonDays(String(id), monthOf(today));
  const row = todayRow.data?.items[0] ?? null;
  const list = useCachedFetch<TeamMemberSummary>(`team-member:${id}:${month}`, () => getTeamMemberSummary(String(id), month));
  const data = list.data;
  const denied = list.error && /403|not in your team|forbidden/i.test(list.error);
  const o = data?.overview ?? null;
  const percent = o && o.targetPaise > 0 && o.achievedPaise !== null ? Math.round((o.achievedPaise / o.targetPaise) * 100) : null;
  const chip = row ? (row.onLeave ? { text: 'On leave', accent: 'purple' as Accent } : dailyPlanChip(row.plan)) : null;

  return (
    <ScreenShell title={data?.member.name ?? 'Person'} subtitle={data ? `${data.member.employeeCode}${data.member.designation ? ` · ${data.member.designation}` : ''}` : undefined} onRefresh={list.reload} refreshing={list.refreshing}>
      {!online ? <Notice tone="info">You’re offline. Connect to see this person.</Notice> : null}
      {list.error && online ? <Notice tone="danger">{denied ? NOT_IN_TEAM_TEXT : list.error}</Notice> : null}
      {list.loading && !data ? <Skeleton cards={3} lines={3} /> : null}

      {data ? (
        <>
          <InfoCard>
            <View style={styles.row}>
              <Avatar name={data.member.name} accent={data.today?.blocked ? 'red' : (chip?.accent === 'slate' ? 'blue' : chip?.accent) ?? 'blue'} size={44} />
              <View style={styles.grow}>
                <ThemedText type="smallBold">{`${data.member.hq?.name ?? 'No HQ'}${data.member.zone ? ` · ${data.member.zone.name}` : ''}`}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{data.member.depth === 1 ? 'Direct report · you decide' : `${data.member.depth} levels below · view only`}</ThemedText>
              </View>
              {data.today?.blocked ? <Pill text="Blocked" accent="red" /> : chip ? <Pill text={chip.text} accent={chip.accent} /> : null}
            </View>
            <TodayHeader
              row={row}
              today={today}
              tourStatus={days.data?.monthlyPlanStatus}
              onOpenReport={() => {
                setMonth(monthOf(today));
                setFocusDate(today);
                setTab('reports');
              }}
            />
          </InfoCard>
          {data.today?.blocked ? (
            <Notice tone="warning" title="Blocked">
              {`${data.member.name} missed a daily report and can’t log or submit anything until you unblock them. Unblock them from the Team board, or from Team → Reports → Unblock.`}
            </Notice>
          ) : null}

          <ChoiceChips
            options={[
              { value: 'overview', label: 'Overview' },
              { value: 'plans', label: 'Plans' },
              { value: 'reports', label: 'Reports' },
              { value: 'expenses', label: 'Expenses' },
              { value: 'leave', label: 'Leave' },
              { value: 'doctors', label: 'Doctors' },
              { value: 'chemists', label: 'Chemists' },
              { value: 'distributors', label: 'Distributors' },
              { value: 'orders', label: 'Orders' },
            ]}
            value={tab}
            onChange={(t) => {
              setFocusDate(null);
              setTab(t);
            }}
          />
          <InfoCard>
            <ThemedText type="smallBold">Month</ThemedText>
            <MonthStepper value={month} onChange={setMonth} min={fy.firstMonth} max={lastMonth} />
          </InfoCard>

          {tab === 'overview' ? (
            o ? (
              <>
                <SummaryStrip
                  items={[
                    { label: 'Working days', value: o.workingDays, accent: 'blue' },
                    { label: 'Reports in', value: `${o.dcr.submitted}/${o.workingDays}`, accent: o.dcr.submitted >= o.workingDays ? 'green' : 'amber' },
                    { label: 'Plans in', value: `${o.plan.submitted}/${o.workingDays}`, accent: o.plan.submitted >= o.workingDays ? 'green' : 'amber' },
                  ]}
                />
                <CardSection icon={sym('phone', 'call')} accent="green" title="Field work">
                  <ThemedText type="small">{`${o.field.calls} calls (${o.field.doctorCalls} doctor, ${o.field.chemistCalls} chemist) · ${o.field.followups} follow-up${o.field.followups === 1 ? '' : 's'}`}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">{`${o.field.reportedDays} days reported · ${o.field.lateDays} late · ${o.field.callsPerDay === null ? 'no calls per day yet' : `${o.field.callsPerDay.toFixed(1)} calls a day`}`}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">{`location: ${o.field.geofence.pass} ok, ${o.field.geofence.fail} failed, ${o.field.geofence.unverified} unverified`}</ThemedText>
                </CardSection>
                <CardSection icon={sym('target', 'track_changes')} accent="red" title={`Sales · ${prettyMonth(month)}`}>
                  <ThemedText type="small">{`Target ${formatRupees(o.targetPaise)} · Achieved ${o.achievedPaise === null ? 'nothing approved' : formatRupees(o.achievedPaise)}${percent === null ? '' : ` · ${percent}%`}`}</ThemedText>
                  {o.targetPaise > 0 && o.achievedPaise !== null ? <Meter value={o.achievedPaise} total={o.targetPaise} accent={percent !== null && percent >= 100 ? 'green' : 'amber'} /> : null}
                  <ThemedText type="small" themeColor="textSecondary">{`Primary ${formatRupees(o.primaryPaise)} · TA ${formatRupees(o.taPaise)} · DA ${formatRupees(o.daPaise)}`}</ThemedText>
                </CardSection>
                <CardSection icon={sym('calendar', 'event')} accent="purple" title="Attendance">
                  <ThemedText type="small">{`${o.attendance.present} present · ${o.attendance.leave} on leave · ${o.attendance.absent} absent · ${o.attendance.strike} strike · ${o.attendance.off} off`}</ThemedText>
                </CardSection>
              </>
            ) : (
              <Notice tone="info">No figures for this month. This person may have left or not started yet.</Notice>
            )
          ) : null}
          {tab === 'plans' ? <PlansTab userId={String(id)} month={month} person={{ name: data.member.name, employeeCode: data.member.employeeCode, designation: data.member.designation }} /> : null}
          {tab === 'reports' ? <ReportsTab userId={String(id)} month={month} focusDate={focusDate} /> : null}
          {tab === 'expenses' ? <ExpensesTab userId={String(id)} month={month} person={{ name: data.member.name, employeeCode: data.member.employeeCode, designation: data.member.designation }} /> : null}
          {tab === 'leave' ? <LeaveTab userId={String(id)} month={month} /> : null}
          {tab === 'doctors' ? <DoctorsTab userId={String(id)} month={month} /> : null}
          {tab === 'chemists' ? <ChemistsTab userId={String(id)} /> : null}
          {tab === 'distributors' ? <DistributorsTab userId={String(id)} /> : null}
          {tab === 'orders' ? <OrdersTab userId={String(id)} month={month} /> : null}
        </>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1, gap: 2 },
});

