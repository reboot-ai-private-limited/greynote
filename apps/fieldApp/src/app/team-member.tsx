import { FyBanner } from '@/components/fy-banner';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { DayPicker } from '@/components/day-picker';
import { MonthStepper } from '@/components/month-stepper';
import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { DayLines } from '@/components/team/member/day-lines';
import { DcrTab } from '@/components/team/member/dcr-tab';
import { ChemistsTab, DistributorsTab, DoctorsTab, ExpensesTab, GiftsTab, LeaveTab, OrdersTab, SamplesTab } from '@/components/team/member/more-tabs';
import { PersonDownloads } from '@/components/team/member/person-downloads';
import { PlansTab } from '@/components/team/member/plans-tab';
import { SecondaryTab } from '@/components/team/member/secondary-tab';
import { tourWordsOn, useTourPlan } from '@/components/team/member/tour-plan-data';
import { ThemedText } from '@/components/themed-text';
import { Avatar, CardSection, InfoCard, Meter, Pill, SummaryStrip, sym } from '@/components/ui-cards';
import { Spacing, type Accent } from '@/constants/theme';
import { useFinancialYear } from '@/lib/financial-year';
import { formatRupees } from '@/lib/money';
import { getCallPerformance, type CallPerformance } from '@/lib/my-reports';
import { type DoctorFilter, NOT_IN_TEAM_TEXT, dailyPlanChip, getTeamDay, getTeamMemberSummary, type TeamBoard, type TeamMemberSummary } from '@/lib/team-section';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { addDays, monthOf, prettyMonth } from '@/offline/day';

type Tab = 'overview' | 'plans' | 'dcr' | 'secondary' | 'doctors' | 'more';
type More = 'expenses' | 'leave' | 'orders' | 'samples' | 'gifts' | 'chemists' | 'distributors';
const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'plans', label: 'Plans' },
  { value: 'dcr', label: 'DCR' },
  { value: 'secondary', label: 'Secondary' },
  { value: 'doctors', label: 'Doctors' },
  { value: 'more', label: 'More' },
];
const MORE: { value: More; label: string }[] = [
  { value: 'expenses', label: 'Expenses' },
  { value: 'leave', label: 'Leave' },
  { value: 'orders', label: 'Orders' },
  { value: 'samples', label: 'Samples & LBL' },
  { value: 'gifts', label: 'Gifts' },
  { value: 'chemists', label: 'Chemists' },
  { value: 'distributors', label: 'Distributors' },
];
const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v}%`);

/**
 * One person of your team (docs/mobile/team.md; reworked 2026-11-28). The header says who they are, with Call, Unblock and Late exception, and
 * how a day looks; then the month, their Excel sheets, and six tabs: Overview (four figures, sales, attendance), Plans, DCR (one row a day),
 * Secondary (by distributor, product detail a tap away), Doctors and More (expenses, leave, orders, samples & LBL, gifts, chemists,
 * distributors). A person outside your downline is refused (403). An older link's `tab` (e.g. `expenses`) lands in More on that list.
 */
export default function TeamMemberScreen() {
  const { id, tab: tabParam, month: monthParam } = useLocalSearchParams<{ id: string; tab?: string; month?: string }>();
  const online = useOnline();
  const fy = useFinancialYear();
  const lastMonth = fy.isPast ? fy.lastMonth : monthOf(fy.today);
  const clamp = (m: string) => (m < fy.firstMonth ? fy.firstMonth : m > lastMonth ? lastMonth : m);
  const [picked, setMonth] = useState<string | null>(typeof monthParam === 'string' && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : null);
  const month = clamp(picked ?? lastMonth);
  const opensMore = MORE.find((m) => m.value === tabParam)?.value;
  const [tab, setTab] = useState<Tab>(opensMore ? 'more' : tabParam === 'reports' ? 'dcr' : (TABS.find((t) => t.value === tabParam)?.value ?? 'overview'));
  const [more, setMore] = useState<More>(opensMore ?? 'expenses');
  const [doctorFilter, setDoctorFilter] = useState<DoctorFilter>('ALL');

  // In a past year Team's "today" is that year's last day. The header shows one day: today until it is changed here.
  const today = fy.effectiveToday;
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
  // Call average and coverage: the same report (and saved copy) as Reports and Visit targets, this person's row.
  const performance = useCachedFetch<CallPerformance>(`call-performance:${month}`, () => getCallPerformance(month));
  const perf = performance.data?.rows.find((r) => r.employee.id === String(id)) ?? null;
  const percent = o && o.targetPaise > 0 && o.achievedPaise !== null ? Math.round((o.achievedPaise / o.targetPaise) * 100) : null;
  const blocked = data?.today?.blocked === true;
  const chip = blocked ? { text: 'Blocked', accent: 'red' as Accent } : row ? (row.onLeave ? { text: 'On leave', accent: 'purple' as Accent } : dailyPlanChip(row.plan)) : null;
  const member = data?.member;

  return (
    <ScreenShell title={member?.name ?? 'Person'} subtitle={member ? `${member.employeeCode}${member.designation ? ` · ${member.designation}` : ''}` : undefined} onRefresh={list.reload} refreshing={list.refreshing}>
      <FyBanner />
      {!online ? <Notice tone="info">You’re offline. Connect to see this person.</Notice> : null}
      {list.error && online ? <Notice tone="danger">{denied ? NOT_IN_TEAM_TEXT : list.error}</Notice> : null}
      {list.loading && !data ? <Skeleton cards={3} lines={3} /> : null}

      {data && member ? (
        <>
          {/* Who they are, what you can do, and how the day looks. */}
          <InfoCard>
            <View style={styles.row}>
              <Avatar name={member.name} accent={blocked ? 'red' : chip?.accent === 'slate' ? 'blue' : (chip?.accent ?? 'blue')} size={48} />
              <View style={styles.grow}>
                <ThemedText type="smallBold">{`${member.hq?.name ?? 'No HQ'}${member.zone ? ` · ${member.zone.name}` : ''}`}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{member.depth === 1 ? 'Direct report · you decide' : `${member.depth} levels below · view only`}</ThemedText>
              </View>
              {chip ? <Pill text={chip.text.replace('Daily plan ', 'Plan ')} accent={chip.accent} /> : null}
            </View>
            <View style={styles.actions}>
              {member.phone ? <PrimaryButton label={`📞 Call ${member.phone}`} variant="text" onPress={() => void Linking.openURL(`tel:${member.phone}`)} /> : null}
              {blocked ? <PrimaryButton label="Unblock" variant="text" disabled={fy.isPast} onPress={() => router.push({ pathname: '/unblock', params: { userId: String(id) } })} /> : null}
              <PrimaryButton label="Late exception" variant="text" disabled={fy.isPast} onPress={() => router.push({ pathname: '/late-grants', params: { userId: String(id) } })} />
            </View>
            {blocked ? <ThemedText type="small" themeColor="danger">{`${member.name} missed a daily report and can’t log or submit anything until unblocked.`}</ThemedText> : null}
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
                  setTab('dcr');
                }}
              />
            ) : (
              <Skeleton cards={1} lines={3} />
            )}
          </InfoCard>

          <InfoCard>
            <MonthStepper value={month} onChange={setMonth} min={fy.firstMonth} max={lastMonth} />
          </InfoCard>
          <PersonDownloads person={{ id: String(id), name: member.name, employeeCode: member.employeeCode, designation: member.designation }} month={month} />

          <ChoiceChips
            options={TABS}
            value={tab}
            onChange={(t) => {
              setDoctorFilter('ALL');
              setTab(t);
            }}
          />

          {tab === 'overview' ? (
            o ? (
              <>
                <SummaryStrip
                  items={[
                    { label: 'Reports in', value: `${o.dcr.submitted}/${o.workingDays}`, accent: o.dcr.submitted >= o.workingDays ? 'green' : 'amber' },
                    { label: 'Call average', value: perf?.doctorCallAvg == null ? '—' : perf.doctorCallAvg.toFixed(1), accent: 'teal' },
                    { label: 'Coverage', value: pct(perf?.coverage.coveragePct), accent: 'blue' },
                    { label: 'Frequency cov.', value: pct(perf?.coverage.frequencyPct), accent: 'green' },
                  ]}
                />
                <ThemedText type="small" themeColor="textSecondary">
                  {`${o.field.doctorCalls} doctor and ${o.field.chemistCalls} chemist calls · ${o.field.followups} follow-up${o.field.followups === 1 ? '' : 's'} · plans in ${o.plan.submitted}/${o.workingDays}${o.field.lateDays ? ` · ${o.field.lateDays} sent late` : ''}`}
                </ThemedText>
                <CardSection icon={sym('target', 'track_changes')} accent="red" title={`Sales · ${prettyMonth(month)}`}>
                  <View style={styles.row}>
                    <ThemedText type="smallBold" style={styles.grow}>{`${o.achievedPaise === null ? 'Nothing approved' : formatRupees(o.achievedPaise)} of ${formatRupees(o.targetPaise)}`}</ThemedText>
                    {percent !== null ? <Pill text={`${percent}%`} accent={percent >= 100 ? 'green' : 'amber'} /> : null}
                  </View>
                  {o.targetPaise > 0 && o.achievedPaise !== null ? <Meter value={o.achievedPaise} total={o.targetPaise} accent={percent !== null && percent >= 100 ? 'green' : 'amber'} /> : null}
                  <ThemedText type="small" themeColor="textSecondary">{`Primary ${formatRupees(o.primaryPaise)} · TA ${formatRupees(o.taPaise)} · DA ${formatRupees(o.daPaise)}`}</ThemedText>
                </CardSection>
                <CardSection icon={sym('calendar', 'event')} accent="purple" title="Attendance">
                  <View style={styles.chips}>
                    <Pill text={`${o.attendance.present} present`} accent="green" />
                    <Pill text={`${o.attendance.leave} leave`} accent="purple" />
                    <Pill text={`${o.attendance.absent} absent`} accent={o.attendance.absent > 0 ? 'red' : 'slate'} />
                    <Pill text={`${o.attendance.off} off`} accent="slate" />
                    {o.attendance.strike ? <Pill text={`${o.attendance.strike} strike`} accent="orange" /> : null}
                  </View>
                </CardSection>
              </>
            ) : (
              <Notice tone="info">No figures for this month. This person may have left or not started yet.</Notice>
            )
          ) : null}
          {tab === 'plans' ? <PlansTab userId={String(id)} month={month} personName={member.name} onOpenReport={(d) => { setMonth(monthOf(d)); setTab('dcr'); }} /> : null}
          {tab === 'dcr' ? <DcrTab userId={String(id)} month={month} personName={member.name} /> : null}
          {tab === 'secondary' ? <SecondaryTab userId={String(id)} month={month} personName={member.name} /> : null}
          {tab === 'doctors' ? <DoctorsTab userId={String(id)} month={month} filter={doctorFilter} onFilter={setDoctorFilter} /> : null}
          {tab === 'more' ? (
            <>
              <ChoiceChips options={MORE} value={more} onChange={setMore} />
              {more === 'expenses' ? <ExpensesTab userId={String(id)} month={month} /> : null}
              {more === 'leave' ? <LeaveTab userId={String(id)} month={month} /> : null}
              {more === 'orders' ? <OrdersTab userId={String(id)} month={month} /> : null}
              {more === 'samples' ? <SamplesTab userId={String(id)} /> : null}
              {more === 'gifts' ? <GiftsTab userId={String(id)} /> : null}
              {more === 'chemists' ? <ChemistsTab userId={String(id)} /> : null}
              {more === 'distributors' ? <DistributorsTab userId={String(id)} /> : null}
            </>
          ) : null}
        </>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1, gap: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
