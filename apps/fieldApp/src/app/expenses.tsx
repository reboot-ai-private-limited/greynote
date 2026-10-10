import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DateStepper } from '@/components/date-stepper';
import { FyBanner } from '@/components/fy-banner';
import { MonthStepper } from '@/components/month-stepper';
import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { ApiError, NetworkError } from '@/lib/api';
import {
  STATUS_TEXT,
  addOther,
  editOther,
  getHistory,
  getStatement,
  removeOther,
  submitMonth,
  type ExpenseDayLine,
  type ExpenseMonthSummary,
  type ExpenseStatement,
} from '@/lib/expense-months';
import { useFinancialYear } from '@/lib/financial-year';
import { formatRupees, rupeesToPaise } from '@/lib/money';
import { getRejectionReason } from '@/lib/planning';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { formatWhen, monthOf, prettyDay, prettyMonth } from '@/offline/day';

const errorText = (err: unknown) => (err instanceof ApiError || err instanceof NetworkError ? err.message : 'Something went wrong. Please try again.');

type Msg = { tone: 'danger' | 'success' | 'info'; text: string };
type Form = { id: string | null; date: string; amount: string; remarks: string };

const firstOf = (month: string) => `${month}-01`;
const lastOf = (month: string) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
};

/**
 * Expenses (decision-log 2026-10-10): your month, date by date — the TA and DA worked out from your approved reports, plus what you
 * paid for yourself, all in one "Other" category, each with the reason it was spent. Once the month is over you send it; your manager (or
 * Admin) approves it, and only then is it paid; if it is sent back you see why. Changing anything needs a connection, but the last
 * statement you opened can still be read offline. Earlier months stay here with whether each was approved. The server takes no
 * receipt files for an expense yet, so none can be attached.
 */
export default function ExpensesScreen() {
  const online = useOnline();
  const fy = useFinancialYear();
  const today = fy.today;
  const thisMonth = monthOf(today);

  // The months stay inside the selected financial year, and stop at this month in the current one.
  const lastMonth = fy.isPast ? fy.lastMonth : thisMonth;
  const clamp = (m: string) => (m < fy.firstMonth ? fy.firstMonth : m > lastMonth ? lastMonth : m);
  const [picked, setMonth] = useState<string | null>(null);
  const month = clamp(picked ?? lastMonth);

  // `tick` re-reads after a change of ours; pulling down (`reload`) shows the refresh spinner.
  const [tick, setTick] = useState(0);
  const reloadAfterChange = () => setTick((t) => t + 1);
  const list = useCachedFetch<ExpenseStatement>(`expense-month:${fy.year}:${month}`, () => getStatement(month), tick);
  const historyList = useCachedFetch<ExpenseMonthSummary[]>('expense-history', () => getHistory(), tick);
  const statement = list.data;
  // The server's history starts at the current month; "previous" means the months before it (this month is the statement above).
  const history = (historyList.data ?? []).filter((h) => h.month < thisMonth);

  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);

  // Why the manager sent a month back, kept with the request it belongs to.
  const [reason, setReason] = useState<{ key: string; text: string | null } | null>(null);
  const rejectedId = statement?.status === 'REJECTED' ? statement.requestId : null;
  useEffect(() => {
    if (!rejectedId || !online) return;
    getRejectionReason(rejectedId)
      .then((text) => setReason({ key: rejectedId, text }))
      .catch(() => undefined);
  }, [rejectedId, online]);
  const rejectionText = rejectedId && reason?.key === rejectedId ? reason.text : null;

  // A past year is read-only, and so is everything while offline.
  const canChange = online && !fy.isPast;

  const startForm = (day?: ExpenseDayLine, entry?: ExpenseDayLine['others'][number]) => {
    setMsg(null);
    const date = day?.date ?? (today.startsWith(month) ? today : lastOf(month));
    setForm({ id: entry?.id ?? null, date, amount: entry ? String(entry.amountPaise / 100) : '', remarks: entry?.remarks ?? '' });
  };

  const save = async () => {
    if (!form) return;
    const amountPaise = rupeesToPaise(form.amount);
    if (amountPaise === null) return setMsg({ tone: 'danger', text: 'Enter the amount in rupees, more than zero, with at most two decimals (for example 250 or 250.50).' });
    const remarks = form.remarks.trim();
    if (remarks === '') return setMsg({ tone: 'danger', text: 'Say what the expense was for.' });
    setBusy(true);
    const body = { reportDate: form.date, amountPaise, remarks };
    try {
      await (form.id ? editOther(form.id, body) : addOther(body));
      setForm(null);
      setMsg({ tone: 'success', text: 'Saved.' });
      reloadAfterChange();
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await removeOther(id);
      reloadAfterChange();
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    setBusy(true);
    try {
      await submitMonth(month);
      setMsg({ tone: 'success', text: 'Sent to your manager for approval.' });
      reloadAfterChange();
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  if (form) {
    return (
      <ScreenShell title={form.id ? 'Edit expense' : 'Add an expense'}>
        <DateStepper label="Date" value={form.date} onChange={(date) => date >= firstOf(month) && date <= lastOf(month) && date <= today && setForm({ ...form, date })} min={firstOf(month)} disabled={busy} />
        <TextField
          label="Amount (₹)"
          value={form.amount}
          onChangeText={(t) => {
            setForm({ ...form, amount: t.replace(/[^0-9.]/g, '') });
            setMsg(null);
          }}
          keyboardType="decimal-pad"
          placeholder="0.00"
          editable={!busy}
        />
        <TextField
          label="Reason — what was it for?"
          value={form.remarks}
          onChangeText={(remarks) => {
            setForm({ ...form, remarks });
            setMsg(null);
          }}
          multiline
          maxLength={1000}
          editable={!busy}
        />
        <Notice tone="info">TA and DA are worked out for you from your approved reports — don’t enter them here.</Notice>
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <PrimaryButton label="Save" loading={busy} onPress={save} />
        <PrimaryButton label="Cancel" variant="text" disabled={busy} onPress={() => setForm(null)} />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title="Expenses" onRefresh={list.reload} refreshing={list.refreshing}>
      <FyBanner />
      <MonthStepper value={month} onChange={(m) => (setMonth(m), setMsg(null))} min={fy.firstMonth} max={lastMonth} />
      {!online ? <Notice tone="info">You’re offline. You can read the last copy; adding, changing and sending need the internet.</Notice> : null}
      {list.stale && list.fetchedAt && statement && (!online || list.error) ? <Notice tone="info">{`Showing the copy from ${formatWhen(list.fetchedAt)}.`}</Notice> : null}
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      {list.error && online ? <Notice tone="danger">{list.error}</Notice> : null}
      {!statement && online && !list.error ? (
        // Same shape as the loaded page: the month's summary card, then a card per day.
        <View style={styles.loading}>
          <Skeleton cards={1} lines={3} />
          <Skeleton cards={3} lines={2} />
        </View>
      ) : null}
      {!statement && !online ? <Notice tone="info">Connect once to load this month.</Notice> : null}

      {statement ? (
        <>
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">{`${prettyMonth(statement.month)} · ${STATUS_TEXT[statement.status]}`}</ThemedText>
            <ThemedText type="small">{`TA ${formatRupees(statement.totals.taPaise)}   DA ${formatRupees(statement.totals.daPaise)}   Other ${formatRupees(statement.totals.otherPaise)}`}</ThemedText>
            <ThemedText type="smallBold">{`Total ${formatRupees(statement.totals.totalPaise)}`}</ThemedText>
            {statement.submittedTotals && statement.submittedTotals.totalPaise !== statement.totals.totalPaise ? (
              <ThemedText type="small" themeColor="danger">{`It was ${formatRupees(statement.submittedTotals.totalPaise)} when you sent it — TA/DA changed since.`}</ThemedText>
            ) : null}
            {statement.paidPaise > 0 ? <ThemedText type="small" themeColor="textSecondary">{`Paid so far ${formatRupees(statement.paidPaise)}`}</ThemedText> : null}
          </ThemedView>

          {statement.status === 'REJECTED' ? (
            <Notice tone="danger" title="Sent back by your approver">
              {rejectionText ?? 'No reason was given. Change what is needed and send it again.'}
            </Notice>
          ) : null}

          {statement.editable && canChange ? <PrimaryButton label="Add an expense" disabled={busy} onPress={() => startForm()} /> : null}

          {statement.days.length === 0 ? (
            <Notice tone="info">Nothing for this month yet.</Notice>
          ) : (
            statement.days.map((day) => (
              <ThemedView key={day.date} type="backgroundElement" style={styles.card}>
                <View style={styles.row}>
                  <ThemedText type="smallBold">{prettyDay(day.date)}</ThemedText>
                  <ThemedText type="smallBold">{formatRupees(day.totalPaise)}</ThemedText>
                </View>
                <ThemedText type="small" themeColor="textSecondary">{`TA ${formatRupees(day.taPaise)} · DA ${formatRupees(day.daPaise)} · Other ${formatRupees(day.otherPaise)}`}</ThemedText>
                {day.others.map((o) => (
                  <View key={o.id} style={styles.row}>
                    <ThemedText type="small" style={styles.grow}>{`${formatRupees(o.amountPaise)}${o.remarks ? ` · ${o.remarks}` : ''}`}</ThemedText>
                    {statement.editable && canChange ? (
                      <View style={styles.actions}>
                        <PrimaryButton label="Edit" variant="text" disabled={busy} onPress={() => startForm(day, o)} />
                        <PrimaryButton label="Remove" variant="text" disabled={busy} onPress={() => remove(o.id)} />
                      </View>
                    ) : null}
                  </View>
                ))}
              </ThemedView>
            ))
          )}

          {statement.editable && !statement.monthEnded ? <Notice tone="info">You can send this month for approval from the 1st of next month.</Notice> : null}
          {statement.canSubmit && canChange ? <PrimaryButton label="Send for approval" loading={busy} onPress={send} /> : null}
        </>
      ) : null}

      {historyList.loading && !historyList.data ? (
        <>
          <ThemedText type="smallBold">Previous months</ThemedText>
          <Skeleton cards={2} lines={2} />
        </>
      ) : null}

      {history.length > 0 ? (
        <>
          <ThemedText type="smallBold">Previous months</ThemedText>
          {history.map((h) => (
            <Pressable key={h.month} accessibilityRole="button" onPress={() => (setMonth(h.month), setMsg(null))}>
              <ThemedView type="backgroundElement" style={styles.card}>
                <View style={styles.row}>
                  <ThemedText type="smallBold">{prettyMonth(h.month)}</ThemedText>
                  <ThemedText type="smallBold">{formatRupees(h.totalPaise)}</ThemedText>
                </View>
                <ThemedText type="small" themeColor="textSecondary">{`TA ${formatRupees(h.taPaise)} · DA ${formatRupees(h.daPaise)} · Other ${formatRupees(h.otherPaise)}`}</ThemedText>
                <ThemedText type="small">{STATUS_TEXT[h.status]}</ThemedText>
              </ThemedView>
            </Pressable>
          ))}
        </>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1 },
  loading: { gap: Spacing.three },
  actions: { flexDirection: 'row', gap: Spacing.one },
});
