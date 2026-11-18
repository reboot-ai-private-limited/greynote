import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FyBanner } from '@/components/fy-banner';
import { MonthStepper } from '@/components/month-stepper';
import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { SelectField } from '@/components/select-field';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Avatar, InfoCard, Pill, SummaryStrip } from '@/components/ui-cards';
import { Spacing } from '@/constants/theme';
import { downloadMonthlyWorkReport } from '@/lib/work-reports';
import { useFinancialYear } from '@/lib/financial-year';
import { formatRupees } from '@/lib/money';
import { EXPENSE_STATE_TEXT, getTeamExpenses, type ExpenseState } from '@/lib/team-section';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { monthOf, prettyMonth } from '@/offline/day';

type Show = 'ALL' | ExpenseState;
const SHOW: { value: Show; label: string }[] = [
  { value: 'ALL', label: 'Everyone' },
  { value: 'NOT_SENT', label: 'Not sent' },
  { value: 'WAITING', label: 'Waiting' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'SENT_BACK', label: 'Sent back' },
];

/**
 * Team → Monthly work report (docs/mobile/team.md): for a month, each person's expenses (TA, DA, other, and whether they sent the month, those not sent first) with a
 * Download of **their Monthly work report (Excel)**. Tap a person for the day-by-day expenses (their Expenses tab). A month a direct report sent is decided in Approvals.
 */
export default function TeamExpensesScreen() {
  const online = useOnline();
  const fy = useFinancialYear();
  const lastMonth = fy.isPast ? fy.lastMonth : monthOf(fy.today);
  const [picked, setMonth] = useState<string | null>(null);
  const month = picked && picked >= fy.firstMonth && picked <= fy.lastMonth ? picked : lastMonth;
  const [show, setShow] = useState<Show>('ALL');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'danger' | 'info'; text: string } | null>(null);
  const download = async (person: { id: string; name: string }) => {
    setBusy(person.id);
    setMsg(null);
    try {
      const done = await downloadMonthlyWorkReport(person, month, prettyMonth(month));
      if (done) setMsg({ tone: 'info', text: done });
    } catch (err) {
      setMsg({ tone: 'danger', text: err instanceof Error ? err.message : 'Couldn’t make the file. Please try again.' });
    } finally {
      setBusy(null);
    }
  };

  const list = useCachedFetch(`team-expenses:${fy.year}:${month}`, () => getTeamExpenses({ month }));
  const all = list.data?.items ?? [];
  const rows = show === 'ALL' ? all : all.filter((r) => r.status === show);
  const sum = (pick: (r: (typeof all)[number]) => number) => all.reduce((n, r) => n + pick(r), 0);

  return (
    <ScreenShell title="Monthly work report" subtitle="Each person’s month: work, DCRs and expenses" onRefresh={list.reload} refreshing={list.refreshing}>
      <FyBanner />
      <MonthStepper value={month} onChange={setMonth} min={fy.firstMonth} max={fy.lastMonth} />
      <View style={styles.filters}>
        <SelectField label="Show" options={SHOW} value={show} onChange={setShow} />
      </View>
      {!online ? <Notice tone="info">You’re offline. Connect to see your team’s month.</Notice> : null}
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      {list.error && online ? <Notice tone="danger">{list.error}</Notice> : null}
      {list.loading && !list.data ? <Skeleton cards={3} lines={2} /> : null}
      {list.data && all.length > 0 ? (
        <>
          <SummaryStrip
            items={[
              { label: 'TA', value: formatRupees(sum((r) => r.taPaise)), accent: 'blue' },
              { label: 'DA', value: formatRupees(sum((r) => r.daPaise)), accent: 'teal' },
              { label: 'Total', value: formatRupees(sum((r) => r.totalPaise)), accent: 'green' },
            ]}
          />
        </>
      ) : null}
      {list.data && rows.length === 0 ? <Notice tone="info">{show === 'ALL' ? 'Nobody in your team yet.' : 'Nothing matches.'}</Notice> : null}
      {rows.length > 0 ? <ThemedText type="small" themeColor="textSecondary">{`Total ${rows.length}`}</ThemedText> : null}

      {rows.map((r) => {
        const state = EXPENSE_STATE_TEXT[r.status];
        return (
          <InfoCard key={r.user.id}>
            <View style={styles.row}>
              <Avatar name={r.user.name} accent={state.accent} size={40} />
              <View style={styles.grow}>
                <ThemedText type="smallBold" numberOfLines={1} onPress={() => router.push({ pathname: '/team-member', params: { id: r.user.id, tab: 'expenses', month } })}>
                  {`${r.user.name} · ${r.user.employeeCode}`}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{`TA ${formatRupees(r.taPaise)} · DA ${formatRupees(r.daPaise)} · Other ${formatRupees(r.otherPaise)}`}</ThemedText>
                <ThemedText type="small">{`Total ${formatRupees(r.totalPaise)}`}</ThemedText>
              </View>
              <Pill text={r.waitingOnYou ? 'Waiting for you' : state.text} accent={r.waitingOnYou ? 'amber' : state.accent} />
            </View>
            <View style={styles.row}>
              <PrimaryButton label={busy === r.user.id ? 'Preparing…' : 'Download Excel'} variant="text" disabled={!online || busy !== null} onPress={() => void download({ id: r.user.id, name: r.user.name })} />
              {r.waitingOnYou ? (
                <ThemedText type="small" themeColor="primary" onPress={() => router.push('/(tabs)/team')}>
                  Decide expenses in Approvals →
                </ThemedText>
              ) : null}
            </View>
          </InfoCard>
        );
      })}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1, gap: 2 },
});
