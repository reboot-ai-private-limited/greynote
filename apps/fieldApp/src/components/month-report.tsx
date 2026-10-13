import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Spacing, type Accent } from '@/constants/theme';
import { getStatement, STATUS_TEXT as EXPENSE_STATUS, type ExpenseMonthStatus, type ExpenseStatement } from '@/lib/expense-months';
import { listOrders, type OrderView } from '@/lib/marketing';
import { formatRupees } from '@/lib/money';
import { getEmployeeSalesReport, type EmployeeSalesReport } from '@/lib/sales';
import { useSessionUser } from '@/lib/session';
import { useCachedFetch } from '@/offline/cached-fetch';
import { prettyMonth } from '@/offline/day';

import { Notice } from './notice';
import { PrimaryButton } from './primary-button';
import { ThemedText } from './themed-text';
import { CardSection, Meter, Pill, sym } from './ui-cards';

const EXPENSE_ACCENT: Record<ExpenseMonthStatus, Accent> = { DRAFT: 'slate', SUBMITTED: 'amber', APPROVED: 'green', REJECTED: 'red' };

/**
 * A month at a glance (docs/mobile/reports.md): your secondary against target, your expenses with where they stand, and your
 * orders. Each card is an existing own-data read; the three load on their own, so one slow read doesn't hold the others back.
 * An earlier year is reached through the Financial Year screen and is read-only.
 */
export function MonthReport({ month, year }: { month: string; year: number }) {
  const me = useSessionUser();
  const sales = useCachedFetch<EmployeeSalesReport>(`rep-month-sales:${year}:${month}`, () => getEmployeeSalesReport(me?.id ?? '', month, month));
  const expenses = useCachedFetch<ExpenseStatement>(`rep-month-exp:${year}:${month}`, () => getStatement(month));
  const orders = useCachedFetch<OrderView[]>(`rep-month-orders:${year}`, listOrders);

  const t = sales.data?.totals;
  const mine = (orders.data ?? []).filter((o) => o.orderDate.startsWith(month) && (!me || o.userId === me.id));
  const distributor = mine.filter((o) => o.outlet.type === 'DISTRIBUTOR');
  const placedValue = distributor.filter((o) => o.status !== 'CANCELLED').reduce((s, o) => s + o.totalAmountPaise, 0);

  return (
    <View style={styles.stack}>
      <CardSection icon={sym('target', 'track_changes')} accent="red" title={`Secondary vs target · ${prettyMonth(month)}`}>
        {sales.error ? <Notice tone="danger">{sales.error}</Notice> : null}
        {sales.loading && !t ? <ThemedText type="small" themeColor="textSecondary">Loading…</ThemedText> : null}
        {t ? (
          <>
            <ThemedText type="small">{`Target ${formatRupees(t.targetPaise)} · Achieved ${formatRupees(t.secondaryPaise)}${t.achievementPercent === null ? '' : ` · ${t.achievementPercent}%`}`}</ThemedText>
            {t.targetPaise > 0 ? <Meter value={t.secondaryPaise} total={t.targetPaise} accent={t.achievementPercent !== null && t.achievementPercent >= 100 ? 'green' : 'amber'} /> : <ThemedText type="small" themeColor="textSecondary">No target is set for this month.</ThemedText>}
            <ThemedText type="small" themeColor="textSecondary">Only secondary your manager approved counts.</ThemedText>
            <PrimaryButton label="Open targets" variant="text" onPress={() => router.push('/targets')} />
          </>
        ) : null}
      </CardSection>

      <CardSection icon={sym('doc.text', 'receipt_long')} accent="green" title="Expenses">
        {expenses.error ? <Notice tone="danger">{expenses.error}</Notice> : null}
        {expenses.loading && !expenses.data ? <ThemedText type="small" themeColor="textSecondary">Loading…</ThemedText> : null}
        {expenses.data ? (
          <>
            <View style={styles.row}>
              <ThemedText type="smallBold" style={styles.grow}>{`Total ${formatRupees(expenses.data.totals.totalPaise)}`}</ThemedText>
              <Pill text={EXPENSE_STATUS[expenses.data.status]} accent={EXPENSE_ACCENT[expenses.data.status]} />
            </View>
            <ThemedText type="small" themeColor="textSecondary">{`TA ${formatRupees(expenses.data.totals.taPaise)} · DA ${formatRupees(expenses.data.totals.daPaise)} · Other ${formatRupees(expenses.data.totals.otherPaise)}${expenses.data.paidPaise > 0 ? ` · Paid ${formatRupees(expenses.data.paidPaise)}` : ''}`}</ThemedText>
            <PrimaryButton label="Open expenses" variant="text" onPress={() => router.push('/expenses')} />
          </>
        ) : null}
      </CardSection>

      <CardSection icon={sym('cart', 'shopping_cart')} accent="orange" title="Orders">
        {orders.error ? <Notice tone="danger">{orders.error}</Notice> : null}
        {orders.loading && !orders.data ? <ThemedText type="small" themeColor="textSecondary">Loading…</ThemedText> : null}
        {orders.data ? (
          <>
            <ThemedText type="small">{`${mine.length} order${mine.length === 1 ? '' : 's'} · distributor value ${formatRupees(placedValue)}`}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{`${distributor.filter((o) => o.status === 'PLACED').length} placed · ${distributor.filter((o) => o.status === 'DONE').length} done · ${distributor.filter((o) => o.status === 'CANCELLED').length} cancelled · ${mine.length - distributor.length} chemist (information only)`}</ThemedText>
            <PrimaryButton label="Open orders" variant="text" onPress={() => router.push('/orders')} />
          </>
        ) : null}
      </CardSection>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1 },
});
