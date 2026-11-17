import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MonthStepper } from '@/components/month-stepper';
import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { PlansTab, ReportsTab } from '@/components/team/member/plans-tab';
import { PillToggle } from '@/components/pill-toggle';
import { MemberDownloads } from '@/components/team/member-downloads';
import { ThemedText } from '@/components/themed-text';
import { Avatar, CardSection, InfoCard, Meter, Pill, RowCard, SummaryStrip, sym } from '@/components/ui-cards';
import { Spacing, type Accent } from '@/constants/theme';
import { useFinancialYear } from '@/lib/financial-year';
import { formatRupees } from '@/lib/money';
import { doctorCountText, routeCountText } from '@/lib/planning';
import { NOT_IN_TEAM_TEXT, getTeamMemberSummary, planChip, type TeamMemberSummary } from '@/lib/team-section';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { monthOf, prettyDay, prettyMonth } from '@/offline/day';

/**
 * One person of your team (docs/mobile/team.md), as tabs: Overview, Plans, Reports and More (the rest of their records). The header says who they
 * are and how today looks; the Actions menu holds Unblock, a late exception and the downloads. A person outside your downline is refused (403).
 */
export default function TeamMemberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const online = useOnline();
  const fy = useFinancialYear();
  const lastMonth = fy.isPast ? fy.lastMonth : monthOf(fy.today);
  const clamp = (m: string) => (m < fy.firstMonth ? fy.firstMonth : m > lastMonth ? lastMonth : m);
  const [picked, setMonth] = useState<string | null>(null);
  const month = clamp(picked ?? lastMonth);
  const [tab, setTab] = useState<'overview' | 'plans' | 'reports' | 'more'>('overview');
  const [menu, setMenu] = useState(false);

  const list = useCachedFetch<TeamMemberSummary>(`team-member:${id}:${month}`, () => getTeamMemberSummary(String(id), month));
  const data = list.data;
  const denied = list.error && /403|not in your team|forbidden/i.test(list.error);
  const o = data?.overview ?? null;
  // Each link opens an existing screen already filtered to this person.
  const go = (pathname: '/unblock' | '/late-grants' | '/team-doctors' | '/team-reports' | '/team-plans' | '/team-leaves' | '/team-orders' | '/team-stock') =>
    router.push({ pathname, params: { userId: String(id) } });
  const percent = o && o.targetPaise > 0 && o.achievedPaise !== null ? Math.round((o.achievedPaise / o.targetPaise) * 100) : null;
  const chip = data?.today ? (data.today.state === 'ON_LEAVE' ? { text: 'On leave', accent: 'purple' as Accent } : planChip(data.today.plan?.status)) : null;

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
            {data.today ? (
              <ThemedText type="small">
                {`${prettyDay(data.date)} · ${data.today.plan ? `${data.today.plan.workingType.replace(/_/g, ' ').toLowerCase()} · ${routeCountText(data.today.plan.routeCount, data.today.plan.routes)}, ${doctorCountText(data.today.plan.doctorCount)}` : 'no daily plan'}${data.today.dcr ? ` · ${data.today.dcr.doctorCalls + data.today.dcr.chemistCalls} calls` : ''}`}
              </ThemedText>
            ) : null}
            <PrimaryButton label={menu ? 'Hide actions ▴' : 'Actions and downloads ⋯'} variant="text" onPress={() => setMenu((m) => !m)} style={styles.link} />
          </InfoCard>
          {menu ? (
            <View style={styles.group}>
              <RowCard icon={sym('lock.open', 'lock_open')} accent="purple" title={data.today?.blocked ? 'Unblock now' : 'Unblock'} subtitle="Clear a block for a missed report" right={chevron} onPress={() => go('/unblock')} />
              <RowCard icon={sym('clock.badge.checkmark', 'schedule')} accent="amber" title="Allow a late plan or expenses" subtitle="One exception, for a time you choose" right={chevron} onPress={() => go('/late-grants')} />
              <MemberDownloads userId={String(id)} employeeCode={data.member.employeeCode} name={data.member.name} designation={data.member.designation} month={month} />
            </View>
          ) : null}
          {data.today?.blocked ? (
            <Notice tone="warning" title="Blocked">
              {`${data.member.name} missed a daily report and can’t log or submit anything until you unblock them.`}
            </Notice>
          ) : null}

          <PillToggle
            options={[
              { value: 'overview', label: 'Overview' },
              { value: 'plans', label: 'Plans' },
              { value: 'reports', label: 'Reports' },
              { value: 'more', label: 'More' },
            ]}
            value={tab}
            onChange={setTab}
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
          {tab === 'plans' ? <PlansTab userId={String(id)} month={month} /> : null}
          {tab === 'reports' ? <ReportsTab userId={String(id)} month={month} /> : null}
          {tab === 'more' ? (
            <View style={styles.group}>
              <RowCard icon={sym('stethoscope', 'medical_services')} accent="teal" title="Doctors" subtitle="Their doctors, and how often each is visited" right={chevron} onPress={() => go('/team-doctors')} />
              <RowCard icon={sym('calendar.badge.clock', 'event_busy')} accent="pink" title="Leave" subtitle="Leave taken or waiting this month" right={chevron} onPress={() => go('/team-leaves')} />
              <RowCard icon={sym('cart', 'shopping_cart')} accent="orange" title="Orders" subtitle="Orders placed this month" right={chevron} onPress={() => go('/team-orders')} />
              <RowCard icon={sym('shippingbox', 'inventory_2')} accent="lime" title="Stock & secondary" subtitle="Stock counts and the month’s secondary" right={chevron} onPress={() => go('/team-stock')} />
              <RowCard icon={sym('doc.text', 'description')} accent="blue" title="Daily reports (full list)" subtitle="Each report with its calls and status" right={chevron} onPress={() => go('/team-reports')} />
            </View>
          ) : null}
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
  link: { alignSelf: 'flex-start' },
});

const chevron = (
  <ThemedText type="smallBold" themeColor="textSecondary">
    ›
  </ThemedText>
);
