import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Accents, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, NetworkError } from '@/lib/api';
import { shareCsv } from '@/lib/csv';
import { getStatement } from '@/lib/expense-months';
import { exportFileName, expensesCsv, tourPlanCsv } from '@/lib/exports';
import { findTeamMemberMonthlyPlan, offDayLabel } from '@/lib/planning';
import { useOnline } from '@/offline';
import { useColleagues } from '@/offline/colleagues';
import { prettyMonth } from '@/offline/day';

import { Notice } from '../notice';
import { ThemedText } from '../themed-text';
import { RowCard, sym } from '../ui-cards';

type Props = { userId: string; employeeCode: string; name: string; month: string };
type What = 'plan' | 'expenses';

const DOWNLOAD = sym('arrow.down.circle.fill', 'download');

const errorText = (err: unknown) =>
  err instanceof ApiError || err instanceof NetworkError || err instanceof Error ? err.message : 'Couldn’t make the file. Please try again.';

/**
 * A manager's downloads for one person in their team: that month's Tour Plan and expense statement as CSV, the same layout the
 * person gets on their own screens. Laid out like the page's Quick actions: one row per file, tapped anywhere. Read live from the
 * server (it checks the person is below the manager), so it needs a connection.
 */
export function MemberDownloads({ userId, employeeCode, name, month }: Props) {
  const online = useOnline();
  const theme = useTheme();
  const { colleagues } = useColleagues();
  const [busy, setBusy] = useState<What | null>(null);
  const [msg, setMsg] = useState<{ key: string; tone: 'danger' | 'info'; text: string } | null>(null);
  // A message belongs to the month it was about.
  const shownMsg = msg?.key === month ? msg : null;

  const run = async (what: What) => {
    setBusy(what);
    setMsg(null);
    try {
      if (what === 'plan') {
        const plan = await findTeamMemberMonthlyPlan(userId, month);
        if (!plan) {
          setMsg({ key: month, tone: 'info', text: `${name} hasn’t submitted a Tour Plan for ${prettyMonth(month)}.` });
          return;
        }
        const offByDate = new Map((plan.offDays ?? []).map((d) => [d.date, d]));
        const byId = new Map(colleagues.map((c) => [c.id, c.name]));
        const csv = tourPlanCsv(month, plan.entries, {
          offLabel: (d) => {
            const off = offByDate.get(d);
            return off ? offDayLabel(off) : null;
          },
          routes: plan.routes,
          personName: (id) => byId.get(id) ?? null,
        });
        await shareCsv(exportFileName('tour-plan', employeeCode, month), csv, `${name} · Tour Plan · ${prettyMonth(month)}`);
      } else {
        const statement = await getStatement(month, userId);
        if (statement.days.length === 0) {
          setMsg({ key: month, tone: 'info', text: `${name} has no expenses for ${prettyMonth(month)}.` });
          return;
        }
        await shareCsv(exportFileName('expenses', employeeCode, month), expensesCsv(statement), `${name} · Expenses · ${prettyMonth(month)}`);
      }
    } catch (err) {
      setMsg({ key: month, tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(null);
    }
  };

  const enabled = online && busy === null;
  const end = (what: What) =>
    busy === what ? (
      <ActivityIndicator color={theme.primary} />
    ) : (
      <SymbolView name={DOWNLOAD} size={26} tintColor={enabled ? Accents.blue.solid : theme.textSecondary} />
    );

  return (
    <View style={styles.group}>
      <ThemedText type="smallBold" style={styles.title}>{`Downloads · ${prettyMonth(month)}`}</ThemedText>
      {!online ? <Notice tone="info">Connect to the internet to download.</Notice> : null}
      {shownMsg ? <Notice tone={shownMsg.tone}>{shownMsg.text}</Notice> : null}
      <View style={!online && styles.off}>
        <RowCard
          icon={sym('calendar', 'calendar_month')}
          accent="indigo"
          title="Tour Plan"
          subtitle="Every day: work type, routes, work with · CSV"
          right={end('plan')}
          onPress={enabled ? () => run('plan') : undefined}
        />
      </View>
      <View style={!online && styles.off}>
        <RowCard
          icon={sym('indianrupeesign.circle', 'payments')}
          accent="amber"
          title="Expenses (TA/DA)"
          subtitle="Date by date: TA, DA, other and totals · CSV"
          right={end('expenses')}
          onPress={enabled ? () => run('expenses') : undefined}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: Spacing.two },
  title: { fontSize: 16, lineHeight: 22 },
  off: { opacity: 0.5 },
});
