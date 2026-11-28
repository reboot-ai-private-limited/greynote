import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing, type Accent } from '@/constants/theme';
import { useFinancialYear } from '@/lib/financial-year';
import { getCallPerformance, type CallPerformance } from '@/lib/my-reports';
import { useCachedFetch } from '@/offline/cached-fetch';
import { monthOf, prettyMonth } from '@/offline/day';

import { MonthStepper } from '../month-stepper';
import { ThemedText } from '../themed-text';
import { InfoCard, RowCard, SummaryStrip, sym } from '../ui-cards';

type Item = { title: string; about: string; href: Href; icon: ReturnType<typeof sym>; accent: Accent };
const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v}%`);
const chevron = <ThemedText type="smallBold" themeColor="textSecondary">›</ThemedText>;

/**
 * Team → Reports (2026-11-28): the team's month at a glance — call average, coverage and frequency coverage for the whole team — then one
 * report per kind, each a list of your people for the month (a tap opens the person, ⤓ Excel downloads the rows), and the two things you do
 * for someone: a late exception, or unblocking a missed report.
 */
export function ReportsPanel() {
  const fy = useFinancialYear();
  const last = fy.isPast ? fy.lastMonth : monthOf(fy.today);
  const [picked, setPicked] = useState<string | null>(null);
  const month = picked && picked >= fy.firstMonth && picked <= last ? picked : last;
  const performance = useCachedFetch<CallPerformance>(`call-performance:${month}`, () => getCallPerformance(month));
  const t = performance.data?.totals;

  const reports: Item[] = [
    { title: 'Call average & coverage', about: 'Calls per working day, doctors met, per person', href: { pathname: '/team-report/[kind]', params: { kind: 'calls', month } } as unknown as Href, icon: sym('chart.bar', 'bar_chart'), accent: 'teal' },
    { title: 'Daily reports', about: 'Reports and plans sent, per person', href: { pathname: '/team-report/[kind]', params: { kind: 'dcr', month } } as unknown as Href, icon: sym('doc.text', 'description'), accent: 'blue' },
    { title: 'Visit targets', about: 'Each doctor’s visits against target, by person', href: '/missed-calls', icon: sym('phone.arrow.up.right', 'call_made'), accent: 'indigo' },
    { title: 'Secondary sales', about: 'Who has sent their month, approved units', href: { pathname: '/team-report/[kind]', params: { kind: 'secondary', month } } as unknown as Href, icon: sym('shippingbox', 'inventory_2'), accent: 'lime' },
    { title: 'Expenses', about: 'Each person’s month total and where it stands', href: { pathname: '/team-report/[kind]', params: { kind: 'expenses', month } } as unknown as Href, icon: sym('indianrupeesign.circle', 'payments'), accent: 'amber' },
    { title: 'Leave', about: 'Your team’s leave touching the month', href: { pathname: '/team-report/[kind]', params: { kind: 'leave', month } } as unknown as Href, icon: sym('calendar.badge.clock', 'event_busy'), accent: 'pink' },
  ];
  const actions: Item[] = [
    { title: 'Late exceptions', about: 'Let someone send a plan or expenses late', href: '/late-grants', icon: sym('clock.badge.checkmark', 'schedule'), accent: 'amber' },
    { title: 'Unblock', about: 'Clear a block for a missed report', href: '/unblock', icon: sym('lock.open', 'lock_open'), accent: 'purple' },
  ];

  return (
    <View style={styles.stack}>
      <InfoCard>
        <MonthStepper value={month} onChange={setPicked} min={fy.firstMonth} max={last} />
      </InfoCard>
      <SummaryStrip
        items={[
          { label: 'Team call average', value: t?.doctorCallAvg == null ? '—' : t.doctorCallAvg.toFixed(1), accent: 'teal' },
          { label: 'Coverage', value: pct(t?.coverage.coveragePct), accent: 'blue' },
          { label: 'Frequency cov.', value: pct(t?.coverage.frequencyPct), accent: 'green' },
        ]}
      />
      <ThemedText type="smallBold">{`Reports · ${prettyMonth(month)}`}</ThemedText>
      <View style={styles.list}>
        {reports.map((i) => (
          <RowCard key={i.title} icon={i.icon} accent={i.accent} title={i.title} subtitle={i.about} right={chevron} onPress={() => router.push(i.href)} />
        ))}
      </View>
      <ThemedText type="smallBold">Actions</ThemedText>
      <View style={styles.list}>
        {actions.map((i) => (
          <RowCard key={i.title} icon={i.icon} accent={i.accent} title={i.title} subtitle={i.about} right={chevron} onPress={() => router.push(i.href)} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.three },
  list: { gap: Spacing.two },
});
