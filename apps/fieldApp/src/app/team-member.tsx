import { FyBanner } from '@/components/fy-banner';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CallPerformanceCard } from '@/components/call-performance-card';
import { MonthStepper } from '@/components/month-stepper';
import { Notice } from '@/components/notice';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { PlansTab, ReportsTab } from '@/components/team/member/plans-tab';
import { ChoiceChips } from '@/components/choice-chips';
import { DayPicker } from '@/components/day-picker';
import { DayLines } from '@/components/team/member/day-lines';
import { PersonDownloads } from '@/components/team/member/person-downloads';
import { tourWordsOn, useTourPlan } from '@/components/team/member/tour-plan-data';
import { ChemistsTab, DistributorsTab, DoctorsMonthCard, DoctorsTab, ExpensesTab, LeaveTab, OrdersTab, SamplesTab, GiftsTab } from '@/components/team/member/more-tabs';
import { ThemedText } from '@/components/themed-text';
import { Avatar, CardSection, InfoCard, Meter, Pill, SummaryStrip, sym } from '@/components/ui-cards';
import { Spacing, type Accent } from '@/constants/theme';
import { useFinancialYear } from '@/lib/financial-year';
import { formatRupees } from '@/lib/money';
import { type DoctorFilter, NOT_IN_TEAM_TEXT, dailyPlanChip, getTeamDay, getTeamMemberSummary, type TeamBoard, type TeamMemberSummary } from '@/lib/team-section';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { addDays, monthOf, prettyMonth } from '@/offline/day';

/**
 * One person of your team (docs/mobile/team.md), as tabs: Overview, Plans, Reports and More (the rest of their records). The header says who they
 * are and how today looks; Unblock and late exceptions are on the Team board and in Team → Reports. A person outside your downline is refused (403).
 */
export default function TeamMemberScreen() {
  const { id, tab: tabParam, month: monthParam } = useLocalSearchParams<{ id: string; tab?: string; month?: string }>();
  const online = useOnline();
  const fy = useFinancialYear();
  const lastMonth = fy.isPast ? fy.lastMonth : monthOf(fy.today);
  const clamp = (m: string) => (m < fy.firstMonth ? fy.firstMonth : m > lastMonth ? lastMonth : m);
  const [picked, setMonth] = useState<string | null>(typeof monthParam === 'string' && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : null);
  const month = clamp(picked ?? lastMonth);
  type Tab = 'overview' | 'plans' | 'reports' | 'expenses' | 'leave' | 'doctors' | 'chemists' | 'distributors' | 'orders' | 'samples' | 'gifts';
  const TABS: Tab[] = ['overview', 'plans', 'reports', 'expenses', 'leave', 'doctors', 'chemists', 'distributors', 'orders', 'samples', 'gifts'];
  // A screen can open the person on a tab (Team → Expenses opens their Expenses).
  const [tab, setTab] = useState<Tab>(TABS.find((t) => t === tabParam) ?? 'overview');
  // Set when the header's "Daily report: Yes" is tapped: that day's report is shown first in the Reports tab.
  const [focusDate, setFocusDate] = useState<string | null>(null);
  const [doctorFilter, setDoctorFilter] = useState<DoctorFilter>('ALL');

  // In a past year Team's "today" is that year's last day.
  const today = fy.effectiveToday;
  // The header shows one day: today until it is changed here.
  const [dayPicked, setDayPicked] = useState<{ year: number; date: string } | null>(null);
  const day = dayPicked && dayPicked.year === fy.year ? dayPicked.date : today;
  const setDay = (d: string) => setDayPicked({ year: fy.year, date: d });
  const tomorrow = fy.isPast ? today : addDays(today, 1);
  const dayRow = useCachedFetch<TeamBoard>(`team-day-one:${fy.year}:${id}:${day}`, () => getTeamDay({ date: day, userId: String(id) }));
  const tourPlan = useTourPlan(String(id), monthOf(day));
  const row = dayRow.data?.items[0] ?? null;
  const list = useCachedFetch<TeamMemberSummary>(`team-member:${id}:${month}`, () => getTeamMemberSummary(String(id), month));
  const data = list.data;
  const denied = list.error && /403|not in your team|forbidden/i.test(list.error);
  const o = data?.overview ?? null;
  const percent = o && o.targetPaise > 0 && o.achievedPaise !== null ? Math.round((o.achievedPaise / o.targetPaise) * 100) : null;
  const chip = row ? (row.onLeave ? { text: 'On leave', accent: 'purple' as Accent } : dailyPlanChip(row.plan)) : null;

  return (
    <ScreenShell title={data?.member.name ?? 'Person'} subtitle={data ? `${data.member.employeeCode}${data.member.designation ? ` · ${data.member.designation}` : ''}` : undefined} onRefresh={list.reload} refreshing={list.refreshing}>
      <FyBanner />
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
            <DayPicker value={day} onChange={(d) => setDay(d > tomorrow ? tomorrow : d)} min={fy.firstMonth ? `${fy.firstMonth}-01` : undefined} max={tomorrow} />
            {row ? (
              <DayLines
                date={day}
                tourWords={tourWordsOn(tourPlan.data, day)}
                tourStatus={tourPlan.data?.status}
                plan={row.plan}
                deadlinePassed={day < today || row.plan?.deadlinePassed === true}
                doctors={row.doctors}
                report={row.report}
                onLeave={row.onLeave}
                onOpenReport={() => {
                  setMonth(monthOf(day));
                  setFocusDate(day);
                  setTab('reports');
                }}
              />
            ) : (
              <Skeleton cards={1} lines={3} />
            )}
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
              { value: 'samples', label: 'Samples & LBL' },
              { value: 'gifts', label: 'Gifts' },
            ]}
            value={tab}
            onChange={(t) => {
              setFocusDate(null);
              setDoctorFilter('ALL');
              setTab(t);
            }}
          />
          <InfoCard>
            <ThemedText type="smallBold">Month</ThemedText>
            <MonthStepper value={month} onChange={setMonth} min={fy.firstMonth} max={lastMonth} />
            <PersonDownloads person={{ id: String(id), name: data.member.name, employeeCode: data.member.employeeCode, designation: data.member.designation }} month={month} />
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
                <DoctorsMonthCard userId={String(id)} month={month} doctorCalls={o.field.doctorCalls} onOpen={() => router.push({ pathname: '/team-doctor-metrics', params: { id: String(id), month } })} />
                <CallPerformanceCard userId={String(id)} month={month} />
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
          {tab === 'plans' ? <PlansTab userId={String(id)} month={month} personName={data.member.name} onOpenReport={(d) => { setMonth(monthOf(d)); setFocusDate(d); setTab('reports'); }} /> : null}
          {tab === 'reports' ? <ReportsTab userId={String(id)} month={month} focusDate={focusDate} /> : null}
          {tab === 'expenses' ? <ExpensesTab userId={String(id)} month={month} /> : null}
          {tab === 'leave' ? <LeaveTab userId={String(id)} month={month} /> : null}
          {tab === 'doctors' ? <DoctorsTab userId={String(id)} month={month} filter={doctorFilter} onFilter={setDoctorFilter} /> : null}
          {tab === 'chemists' ? <ChemistsTab userId={String(id)} /> : null}
          {tab === 'distributors' ? <DistributorsTab userId={String(id)} /> : null}
          {tab === 'orders' ? <OrdersTab userId={String(id)} month={month} /> : null}
          {tab === 'samples' ? <SamplesTab userId={String(id)} /> : null}
          {tab === 'gifts' ? <GiftsTab userId={String(id)} /> : null}
        </>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1, gap: 2 },
});

