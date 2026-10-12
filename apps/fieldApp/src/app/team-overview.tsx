import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { FyBanner } from '@/components/fy-banner';
import { MonthStepper } from '@/components/month-stepper';
import { Notice } from '@/components/notice';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Avatar, InfoCard, Meter, SummaryStrip } from '@/components/ui-cards';
import { Spacing } from '@/constants/theme';
import { useFinancialYear } from '@/lib/financial-year';
import { formatRupees } from '@/lib/money';
import { NOT_IN_TEAM_TEXT, getTeamOverview, type TeamOverview, type TeamScopeFilter } from '@/lib/team-section';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { monthOf } from '@/offline/day';

const SCOPES: { value: TeamScopeFilter; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'direct', label: 'Direct reports' },
  { value: 'indirect', label: 'Further down' },
];

/**
 * Team → Overview (docs/mobile/team.md): the team's overall report for a month, one card per person: plans and reports in,
 * calls, TA/DA, target against achievement. A running month is read up to today. Needs a connection; the last copy stays on
 * the phone. A manager with no team is refused by the server.
 */
export default function TeamOverviewScreen() {
  const online = useOnline();
  const fy = useFinancialYear();
  const lastMonth = fy.isPast ? fy.lastMonth : monthOf(fy.today);
  const clamp = (m: string) => (m < fy.firstMonth ? fy.firstMonth : m > lastMonth ? lastMonth : m);
  const [picked, setMonth] = useState<string | null>(null);
  const month = clamp(picked ?? lastMonth);
  const [scope, setScope] = useState<TeamScopeFilter>('all');
  const [search, setSearch] = useState('');
  const term = search.trim();

  const list = useCachedFetch<TeamOverview>(`team-overview:${fy.year}:${month}:${scope}:${term}`, () => getTeamOverview({ month, scope, search: term || undefined }));
  const data = list.data;
  const t = data?.totals as Record<string, number> | undefined;

  return (
    <ScreenShell title="Team overview" subtitle="Plans, reports, calls and sales for the month" wide onRefresh={list.reload} refreshing={list.refreshing}>
      <FyBanner />
      <MonthStepper value={month} onChange={setMonth} min={fy.firstMonth} max={lastMonth} />
      <TextField label="Search by name or code" value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} />
      <ChoiceChips options={SCOPES} value={scope} onChange={setScope} />
      {!online ? <Notice tone="info">You’re offline. Connect to see the team report.</Notice> : null}
      {list.error && online ? <Notice tone="danger">{/403/.test(list.error) ? NOT_IN_TEAM_TEXT : list.error}</Notice> : null}
      {list.loading && !data ? <Skeleton cards={3} lines={4} /> : null}

      {data && t ? (
        <SummaryStrip
          items={[
            { label: 'People', value: data.total, accent: 'blue' },
            { label: 'Target', value: formatRupees(t.targetPaise ?? 0), accent: 'purple' },
            { label: 'Achieved', value: formatRupees(t.achievedPaise ?? 0), accent: 'green' },
          ]}
        />
      ) : null}
      {data && data.items.length === 0 ? <Notice tone="info">No one matches.</Notice> : null}

      {(data?.items ?? []).map((r) => {
        const percent = r.targetPaise > 0 && r.achievedPaise !== null ? Math.round((r.achievedPaise / r.targetPaise) * 100) : null;
        return (
          <InfoCard key={r.employee.id}>
            <View style={styles.row}>
              <Avatar name={r.employee.name} accent="blue" size={40} />
              <View style={styles.grow}>
                <ThemedText type="smallBold" numberOfLines={1}>{`${r.employee.name} · ${r.employee.employeeCode}`}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {[r.designation, typeof r.zone === 'string' ? r.zone : r.zone?.name].filter(Boolean).join(' · ')}
                </ThemedText>
              </View>
            </View>
            <ThemedText type="small">{`${r.workingDays} working days · plans ${r.plan.submitted} sent, ${r.plan.approved} approved · reports ${r.dcr.submitted} sent, ${r.dcr.approved} approved`}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{`${r.field.calls} calls (${r.field.callsPerDay.toFixed(1)} a day) · ${r.field.followups} follow-ups · ${r.field.lateDays} late · ${r.field.notInPlan} not in plan`}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{`${r.attendance.present} present · ${r.attendance.leave} leave · ${r.attendance.absent} absent`}</ThemedText>
            {r.targetPaise > 0 ? (
              <>
                <Meter value={r.achievedPaise ?? 0} total={r.targetPaise} accent={percent !== null && percent >= 100 ? 'green' : percent !== null && percent >= 50 ? 'amber' : 'red'} />
                <ThemedText type="small">{`Target ${formatRupees(r.targetPaise)} · Achieved ${r.achievedPaise === null ? 'nothing entered' : formatRupees(r.achievedPaise)}${percent === null ? '' : ` · ${percent}%`}`}</ThemedText>
              </>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">No target this month.</ThemedText>
            )}
            <ThemedText type="small" themeColor="textSecondary">{`Primary ${formatRupees(r.primaryPaise)} · TA ${formatRupees(r.taPaise)} · DA ${formatRupees(r.daPaise)}`}</ThemedText>
            <ThemedText type="small" themeColor="primary" onPress={() => router.push({ pathname: '/team-member', params: { id: r.employee.id } })}>
              View person →
            </ThemedText>
          </InfoCard>
        );
      })}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1, gap: 2 },
});
