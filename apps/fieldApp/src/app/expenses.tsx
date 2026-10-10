import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DateStepper } from '@/components/date-stepper';
import { MonthStepper } from '@/components/month-stepper';
import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useDayGate } from '@/hooks/use-day-gate';
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
import { formatRupees, rupeesToPaise } from '@/lib/money';
import { useOnline } from '@/offline';
import { prettyDay, prettyMonth } from '@/offline/day';

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
 * paid for yourself, all in one "Other" category. Once the month is over you send it; your manager (or Admin) approves it, and only
 * then is it paid. Needs a connection. Earlier months stay here with whether each was approved.
 */
export default function ExpensesScreen() {
  const { today } = useDayGate();
  const online = useOnline();
  const thisMonth = today.slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [loaded, setStatement] = useState<ExpenseStatement | null>(null);
  // A statement of another month is still loading: show the skeleton, not the old month under the new heading.
  const statement = loaded?.month === month ? loaded : null;
  const [history, setHistory] = useState<ExpenseMonthSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    if (!online) return;
    let alive = true;
    getStatement(month)
      .then((s) => alive && (setStatement(s), setLoadError(null)))
      .catch((err) => alive && setLoadError(errorText(err)));
    getHistory()
      .then((h) => alive && setHistory(h))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [online, month, reloadKey]);

  const startForm = (day?: ExpenseDayLine, entry?: ExpenseDayLine['others'][number]) => {
    setMsg(null);
    const date = day?.date ?? (today.startsWith(month) ? today : lastOf(month));
    setForm({ id: entry?.id ?? null, date, amount: entry ? String(entry.amountPaise / 100) : '', remarks: entry?.remarks ?? '' });
  };

  const save = async () => {
    if (!form) return;
    const amountPaise = rupeesToPaise(form.amount);
    if (amountPaise === null) return setMsg({ tone: 'danger', text: 'Enter the amount in rupees, more than zero, with at most two decimals (for example 250 or 250.50).' });
    setBusy(true);
    const body = { reportDate: form.date, amountPaise, remarks: form.remarks.trim() || null };
    try {
      await (form.id ? editOther(form.id, body) : addOther(body));
      setForm(null);
      setMsg({ tone: 'success', text: 'Saved.' });
      reload();
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
      reload();
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    setBusy(true);
    try {
      setStatement(await submitMonth(month));
      setMsg({ tone: 'success', text: 'Sent to your manager for approval.' });
      reload();
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  if (!online) {
    return (
      <ScreenShell title="Expenses">
        <Notice tone="info">You’re offline. Connect to the internet to see or change your expenses.</Notice>
      </ScreenShell>
    );
  }

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
        <TextField label="What was it for? (optional)" value={form.remarks} onChangeText={(remarks) => setForm({ ...form, remarks })} multiline maxLength={1000} editable={!busy} />
        <Notice tone="info">TA and DA are worked out for you from your approved reports — don’t enter them here.</Notice>
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <PrimaryButton label="Save" loading={busy} onPress={save} />
        <PrimaryButton label="Cancel" variant="text" disabled={busy} onPress={() => setForm(null)} />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title="Expenses">
      <MonthStepper value={month} onChange={(m) => { setMonth(m); setMsg(null); }} max={thisMonth} />
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      {loadError ? <Notice tone="danger">{loadError}</Notice> : null}
      {!statement && !loadError ? <Skeleton /> : null}

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

          {statement.editable ? <PrimaryButton label="Add an expense" disabled={busy} onPress={() => startForm()} /> : null}

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
                    {statement.editable ? (
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
          {statement.canSubmit ? <PrimaryButton label="Send for approval" loading={busy} onPress={send} /> : null}
        </>
      ) : null}

      {history.length > 0 ? (
        <>
          <ThemedText type="smallBold">Previous months</ThemedText>
          {history.map((h) => (
            <Pressable key={h.month} accessibilityRole="button" onPress={() => setMonth(h.month)}>
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
  actions: { flexDirection: 'row', gap: Spacing.one },
});
