import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MonthStepper } from '@/components/month-stepper';
import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Avatar, CardSection, InfoCard, Meter, Pill, RowCard, SummaryStrip, sym } from '@/components/ui-cards';
import { Spacing, type Accent } from '@/constants/theme';
import { useFinancialYear } from '@/lib/financial-year';
import { formatRupees } from '@/lib/money';
import { DAY_STATE_TEXT, NOT_IN_TEAM_TEXT, getTeamMemberSummary, type DayState, type TeamMemberSummary } from '@/lib/team-section';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { monthOf, prettyDay, prettyMonth } from '@/offline/day';

const STATE_ACCENT: Record<DayState, Accent> = { REPORTED: 'green', WORKING: 'blue', NOT_YET: 'slate', NOT_STARTED: 'red', MISSED: 'red', ON_LEAVE: 'purple', OFF: 'slate' };

/**
 * One person of your team (docs/mobile/team.md): today, and their month at a glance. Their plans, reports, expenses, leave and
 * doctors are the Team reports and other Team screens with this person. A person outside your downline is refused (403).
 */
export default function TeamMemberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const online = useOnline();
  const fy = useFinancialYear();
  const lastMonth = fy.isPast ? fy.lastMonth : monthOf(fy.today);
  const clamp = (m: string) => (m < fy.firstMonth ? fy.firstMonth : m > lastMonth ? lastMonth : m);
  const [picked, setMonth] = useState<string | null>(null);
  const month = clamp(picked ?? lastMonth);

  const list = useCachedFetch<TeamMemberSummary>(`team-member:${id}:${month}`, () => getTeamMemberSummary(String(id), month));
  const data = list.data;
  const denied = list.error && /403|not in your team|forbidden/i.test(list.error);
  const o = data?.overview ?? null;
  // Each link opens an existing screen already filtered to this person.
  const go = (pathname: '/unblock' | '/late-grants' | '/targets' | '/team-doctors' | '/team-reports' | '/team-plans' | '/team-leaves' | '/team-orders' | '/team-stock') =>
    router.push({ pathname, params: { userId: String(id) } });
  const percent = o && o.targetPaise > 0 && o.achievedPaise !== null ? Math.round((o.achievedPaise / o.targetPaise) * 100) : null;

  return (
    <ScreenShell title={data?.member.name ?? 'Person'} subtitle={data ? `${data.member.employeeCode}${data.member.designation ? ` · ${data.member.designation}` : ''}` : undefined} onRefresh={list.reload} refreshing={list.refreshing}>
      {!online ? <Notice tone="info">You’re offline. Connect to see this person.</Notice> : null}
      {list.error && online ? <Notice tone="danger">{denied ? NOT_IN_TEAM_TEXT : list.error}</Notice> : null}
      {list.loading && !data ? <Skeleton cards={3} lines={3} /> : null}

      {data ? (
        <>
          <InfoCard>
            <View style={styles.row}>
              <Avatar name={data.member.name} accent={data.today ? STATE_ACCENT[data.today.state] : 'slate'} size={44} />
              <View style={styles.grow}>
                <ThemedText type="smallBold">{`${data.member.hq?.name ?? 'No HQ'}${data.member.zone ? ` · ${data.member.zone.name}` : ''}`}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{data.member.depth === 1 ? 'Direct report · you decide' : `${data.member.depth} levels below · view only`}</ThemedText>
              </View>
              {data.today ? (data.today.blocked ? <Pill text="Blocked" accent="red" /> : <Pill text={DAY_STATE_TEXT[data.today.state]} accent={STATE_ACCENT[data.today.state]} />) : null}
            </View>
            {data.today ? (
              <>
                <ThemedText type="small" themeColor="textSecondary">{prettyDay(data.date)}</ThemedText>
                <ThemedText type="small">
                  {data.today.plan ? `${data.today.plan.workingType.replace(/_/g, ' ').toLowerCase()} · ${data.today.plan.routeCount} routes, ${data.today.plan.doctorCount} doctors` : 'No daily plan'}
                </ThemedText>
                {data.today.dcr ? <ThemedText type="small">{`${data.today.dcr.doctorCalls} doctor, ${data.today.dcr.chemistCalls} chemist calls · ${data.today.dcr.followups} follow-up${data.today.dcr.followups === 1 ? '' : 's'}`}</ThemedText> : null}
              </>
            ) : null}
          </InfoCard>

          {data.today?.blocked ? (
            <Notice tone="warning" title="Blocked">
              {`${data.member.name} missed a daily report and can’t log or submit anything until you unblock them.`}
            </Notice>
          ) : null}
          <View style={styles.group}>
            <ThemedText type="smallBold" style={styles.groupTitle}>Quick actions</ThemedText>
            {data.today?.blocked ? (
              <PrimaryButton label="Unblock now" onPress={() => go('/unblock')} />
            ) : (
              <RowCard icon={sym('lock.open', 'lock_open')} accent="purple" title="Unblock" subtitle="Clear a block for a missed report" right={chevron} onPress={() => go('/unblock')} />
            )}
            <RowCard icon={sym('clock.badge.checkmark', 'schedule')} accent="amber" title="Allow a late plan or expenses" subtitle="One exception, for a time you choose" right={chevron} onPress={() => go('/late-grants')} />
            <RowCard icon={sym('target', 'track_changes')} accent="red" title="Set a sales target" subtitle="For a month or a run of months" right={chevron} onPress={() => go('/targets')} />
            <RowCard icon={sym('stethoscope', 'medical_services')} accent="teal" title="Doctor visit targets" subtitle="How often each doctor is visited" right={chevron} onPress={() => go('/team-doctors')} />
          </View>

          <InfoCard>
            <ThemedText type="smallBold">Month</ThemedText>
            <MonthStepper value={month} onChange={setMonth} min={fy.firstMonth} max={lastMonth} />
          </InfoCard>

          {o ? (
            <>
              <SummaryStrip
                items={[
                  { label: 'Working days', value: o.workingDays, accent: 'blue' },
                  { label: 'Reports in', value: `${o.dcr.submitted}/${o.workingDays}`, accent: o.dcr.submitted >= o.workingDays ? 'green' : 'amber' },
                  { label: 'Plans in', value: `${o.plan.submitted}/${o.workingDays}`, accent: o.plan.submitted >= o.workingDays ? 'green' : 'amber' },
                ]}
              />
              <CardSection icon={sym('target', 'track_changes')} accent="red" title={`Sales · ${prettyMonth(month)}`}>
                <ThemedText type="small">{`Target ${formatRupees(o.targetPaise)} · Achieved ${o.achievedPaise === null ? 'nothing entered' : formatRupees(o.achievedPaise)}${percent === null ? '' : ` · ${percent}%`}`}</ThemedText>
                {o.targetPaise > 0 && o.achievedPaise !== null ? <Meter value={o.achievedPaise} total={o.targetPaise} accent={percent !== null && percent >= 100 ? 'green' : 'amber'} /> : null}
                <ThemedText type="small" themeColor="textSecondary">{`Primary ${formatRupees(o.primaryPaise)} · TA ${formatRupees(o.taPaise)} · DA ${formatRupees(o.daPaise)}`}</ThemedText>
              </CardSection>
              <CardSection icon={sym('phone', 'call')} accent="green" title="Field work">
                <ThemedText type="small">{`${o.field.calls} calls (${o.field.doctorCalls} doctor, ${o.field.chemistCalls} chemist) · ${o.field.followups} follow-up${o.field.followups === 1 ? '' : 's'}`}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{`${o.field.reportedDays} days reported · ${o.field.lateDays} late · ${o.field.callsPerDay === null ? 'no calls per day yet' : `${o.field.callsPerDay.toFixed(1)} calls a day`}`}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{`${o.field.notInPlan} not in plan · ${o.field.offRouteCalls} off route · location: ${o.field.geofence.pass} ok, ${o.field.geofence.fail} failed, ${o.field.geofence.unverified} unverified`}</ThemedText>
              </CardSection>
              <CardSection icon={sym('calendar', 'event')} accent="purple" title="Attendance">
                <ThemedText type="small">{`${o.attendance.present} present · ${o.attendance.leave} leave · ${o.attendance.absent} absent · ${o.attendance.strike} strike · ${o.attendance.off} off`}</ThemedText>
              </CardSection>
            </>
          ) : (
            <Notice tone="info">No figures for this month. This person may have left or not started yet.</Notice>
          )}

          <View style={styles.group}>
            <ThemedText type="smallBold" style={styles.groupTitle}>{`${data.member.name}’s records`}</ThemedText>
            <RowCard icon={sym('doc.text', 'description')} accent="blue" title="Daily reports" subtitle="Each report with its calls and status" right={chevron} onPress={() => go('/team-reports')} />
            <RowCard icon={sym('calendar', 'event_note')} accent="teal" title="Daily plans" subtitle="The plan for any day, tomorrow too" right={chevron} onPress={() => go('/team-plans')} />
            <RowCard icon={sym('calendar.badge.clock', 'event_busy')} accent="pink" title="Leave" subtitle="Leave taken or waiting this month" right={chevron} onPress={() => go('/team-leaves')} />
            <RowCard icon={sym('cart', 'shopping_cart')} accent="orange" title="Orders" subtitle="Orders placed this month" right={chevron} onPress={() => go('/team-orders')} />
            <RowCard icon={sym('shippingbox', 'inventory_2')} accent="lime" title="Stock & secondary" subtitle="Stock counts and the month’s secondary" right={chevron} onPress={() => go('/team-stock')} />
          </View>
        </>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1, gap: 2 },
  group: { gap: Spacing.two },
  groupTitle: { fontSize: 16, lineHeight: 22 },
});

const chevron = (
  <ThemedText type="smallBold" themeColor="textSecondary">
    ›
  </ThemedText>
);
