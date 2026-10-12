import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MonthStepper } from '@/components/month-stepper';
import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Avatar, CardSection, InfoCard, Meter, Pill, SummaryStrip, sym } from '@/components/ui-cards';
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
                <ThemedText type="small" themeColor="textSecondary">{data.member.depth === 1 ? 'Your direct report' : `${data.member.depth} levels below you`}</ThemedText>
              </View>
              {data.today ? <Pill text={DAY_STATE_TEXT[data.today.state]} accent={STATE_ACCENT[data.today.state]} /> : null}
            </View>
            {data.today ? (
              <>
                <ThemedText type="small" themeColor="textSecondary">{prettyDay(data.date)}</ThemedText>
                <ThemedText type="small">
                  {data.today.plan ? `${data.today.plan.workingType.replace(/_/g, ' ').toLowerCase()} · ${data.today.plan.routeCount} routes, ${data.today.plan.doctorCount} doctors` : 'No daily plan'}
                </ThemedText>
                {data.today.dcr ? <ThemedText type="small">{`${data.today.dcr.doctorCalls} doctor, ${data.today.dcr.chemistCalls} chemist calls · ${data.today.dcr.followups} follow-ups`}</ThemedText> : null}
                {data.today.blocked ? <Pill text="Blocked" accent="red" /> : null}
              </>
            ) : null}
          </InfoCard>

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
                <ThemedText type="small">{`${o.field.calls} calls (${o.field.doctorCalls} doctor, ${o.field.chemistCalls} chemist) · ${o.field.followups} follow-ups`}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{`${o.field.reportedDays} days reported · ${o.field.lateDays} late · ${o.field.callsPerDay.toFixed(1)} calls a day`}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{`${o.field.notInPlan} not in plan · ${o.field.offRouteCalls} off route · location: ${o.field.geofence.pass} ok, ${o.field.geofence.fail} failed, ${o.field.geofence.unverified} unverified`}</ThemedText>
              </CardSection>
              <CardSection icon={sym('calendar', 'event')} accent="purple" title="Attendance">
                <ThemedText type="small">{`${o.attendance.present} present · ${o.attendance.leave} leave · ${o.attendance.absent} absent · ${o.attendance.strike} strike · ${o.attendance.off} off`}</ThemedText>
              </CardSection>
            </>
          ) : (
            <Notice tone="info">No figures for this month. This person may have left or not started yet.</Notice>
          )}

          <CardSection icon={sym('wrench.and.screwdriver', 'build')} accent="amber" title="Actions">
            <PrimaryButton label="Unblock" variant="text" onPress={() => router.push('/unblock')} />
            <PrimaryButton label="Allow a late plan or expenses" variant="text" onPress={() => router.push('/late-grants')} />
            <PrimaryButton label="Set a target" variant="text" onPress={() => router.push('/targets')} />
            <PrimaryButton label="Their daily reports" variant="text" onPress={() => router.push('/team-reports')} />
          </CardSection>
        </>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1, gap: 2 },
});
