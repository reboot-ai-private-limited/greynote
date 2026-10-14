import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { DateStepper } from '@/components/date-stepper';
import { FormField } from '@/components/form-field';
import { FyBanner } from '@/components/fy-banner';
import { MonthStepper } from '@/components/month-stepper';
import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { CardSection, InfoCard, Pill, StatusBanner, SummaryStrip, sym } from '@/components/ui-cards';
import { Spacing, type Accent } from '@/constants/theme';
import { useFormErrors } from '@/hooks/use-form-errors';
import { ApiError, NetworkError } from '@/lib/api';
import {
  STATUS_TEXT,
  SUBMIT_LATE_TEXT,
  addExpenseProof,
  addOther,
  editOther,
  getHistory,
  getStatement,
  removeExpenseProof,
  removeOther,
  submitMonth,
  type ExpenseDayLine,
  type ExpenseMonthStatus,
  type ExpenseMonthSummary,
  type ExpenseProofFile,
  type ExpenseStatement,
} from '@/lib/expense-months';
import { useFinancialYear } from '@/lib/financial-year';
import { MAX_PROOF_FILES } from '@/lib/leave';
import { formatRupees, rupeesToPaise } from '@/lib/money';
import { formatSize, pickProofFile, type PickedProof } from '@/lib/proof-picker';
import { getRejectionReason } from '@/lib/planning';
import { useOnline } from '@/offline';
import { useCachedSource } from '@/offline/cache';
import { useCachedFetch } from '@/offline/cached-fetch';
import type { ConfigSnapshot } from '@/types/sync';
import { formatWhen, monthOf, nowMs, prettyDay, prettyMonth } from '@/offline/day';

/** The add-expense form's fields top to bottom, so a failed save scrolls to the first one with a problem. */
const FIELD_ORDER = ['amount', 'remarks'];
const errorText =(err: unknown) => (err instanceof ApiError || err instanceof NetworkError ? err.message : 'Something went wrong. Please try again.');

type Msg = { tone: 'danger' | 'success' | 'info'; text: string };
/** `existing` are receipts the server already has (removing one is immediate); `files` are picked and go up when you save. */
type Form = { id: string | null; date: string; amount: string; remarks: string; existing: ExpenseProofFile[]; files: PickedProof[] };

const STATUS_ACCENT: Record<ExpenseMonthStatus, Accent> = { DRAFT: 'slate', SUBMITTED: 'amber', APPROVED: 'green', REJECTED: 'red' };

const firstOf =(month: string) => `${month}-01`;
const lastOf = (month: string) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
};

/**
 * Expenses (decision-log 2026-10-10): your month, date by date — the TA and DA worked out from your approved reports, plus what you
 * paid for yourself, all in one "Other" category, each with the reason it was spent. Once the month is over you send it; your manager (or
 * Admin) approves it, and only then is it paid; if it is sent back you see why. Changing anything needs a connection, but the last
 * statement you opened can still be read offline. Earlier months stay here with whether each was approved. Each Other entry can carry
 * up to 3 receipts (PDF, JPG or PNG, 5 MB each, optional): the expense is saved first, then each file is uploaded, so a failed upload
 * never loses the expense.
 */
export default function ExpensesScreen() {
  const online = useOnline();
  const timeZone = useCachedSource<ConfigSnapshot>('config').data?.settings.BUSINESS_TIMEZONE;
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
  const fe = useFormErrors(FIELD_ORDER);

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
    setForm({ id: entry?.id ?? null, date, amount: entry ? String(entry.amountPaise / 100) : '', remarks: entry?.remarks ?? '', existing: entry?.attachments ?? [], files: [] });
  };

  const attach = async () => {
    if (!form) return;
    const picked = await pickProofFile(form.existing.length + form.files.length);
    if (!picked) return;
    if (picked.error) return setMsg({ tone: 'danger', text: picked.error });
    if (picked.file) {
      setMsg(null);
      setForm({ ...form, files: [...form.files, picked.file] });
    }
  };

  // A receipt the server already has is taken off at once; a picked one just leaves the list.
  const dropExisting = async (file: ExpenseProofFile) => {
    if (!form?.id) return;
    setBusy(true);
    try {
      const left = await removeExpenseProof(form.id, file.id);
      setForm((f) => (f ? { ...f, existing: left } : f));
      reloadAfterChange();
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!form) return;
    const amountPaise = rupeesToPaise(form.amount);
    const remarks = form.remarks.trim();
    const problems: Record<string, string> = {};
    if (amountPaise === null) problems.amount = 'Enter the amount in rupees, more than zero, with at most two decimals (for example 250 or 250.50).';
    if (remarks === '') problems.remarks = 'Say what the expense was for.';
    if (amountPaise === null || remarks === '') {
      setMsg({ tone: 'danger', text: 'Fix the fields marked in red.' });
      return fe.fail(problems);
    }
    fe.clearAll();
    setBusy(true);
    const body = { reportDate: form.date, amountPaise, remarks };
    try {
      let expenseId = form.id;
      if (expenseId) await editOther(expenseId, body);
      else expenseId = (await addOther(body)).id;
      // The expense exists now, so a receipt that fails to upload never loses it: say which one and let them add it again.
      const failed: string[] = [];
      for (const file of form.files) {
        try {
          await addExpenseProof(expenseId, file);
        } catch (err) {
          failed.push(`${file.name} (${errorText(err)})`);
        }
      }
      setForm(null);
      reloadAfterChange();
      setMsg(
        failed.length === 0
          ? { tone: 'success', text: 'Saved.' }
          : { tone: 'danger', text: `The expense is saved, but ${failed.length === 1 ? 'a receipt' : `${failed.length} receipts`} could not be attached: ${failed.join('; ')}. Tap Edit on it to try again.` },
      );
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
      // A race with the deadline: show the fresh statement with the same message the screen uses.
      if (err instanceof ApiError && (err.data?.code === 'EXPENSE_SUBMIT_LATE' || (err.status === 409 && /deadline|exception/i.test(err.message)))) {
        setMsg({ tone: 'danger', text: SUBMIT_LATE_TEXT });
        reloadAfterChange();
      } else setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  if (form) {
    return (
      <ScreenShell
        title={form.id ? 'Edit expense' : 'Add an expense'}
        subtitle={prettyMonth(month)}
        footer={
          <View style={styles.actionsCol}>
            <PrimaryButton label="Save" loading={busy} onPress={save} />
            <PrimaryButton label="Cancel" variant="text" disabled={busy} onPress={() => setForm(null)} />
          </View>
        }>
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <Notice tone="info">TA and DA are worked out for you from your approved reports — don’t enter them here.</Notice>
        <CardSection icon={sym('indianrupeesign.circle', 'payments')} accent="green" title="Expense">
          <DateStepper label="Date" value={form.date} onChange={(date) => date >= firstOf(month) && date <= lastOf(month) && date <= today && setForm({ ...form, date })} min={firstOf(month)} disabled={busy} />
          <FormField form={fe} name="amount" outline={false}>
            <TextField
              label="Amount (₹)"
              value={form.amount}
              onChangeText={(t) => {
                setForm({ ...form, amount: t.replace(/[^0-9.]/g, '') });
                setMsg(null);
                fe.clear('amount');
              }}
              error={fe.errors.amount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              editable={!busy}
            />
          </FormField>
          <FormField form={fe} name="remarks" outline={false}>
            <TextField
              label="Reason — what was it for?"
              value={form.remarks}
              onChangeText={(remarks) => {
                setForm({ ...form, remarks });
                setMsg(null);
                fe.clear('remarks');
              }}
              error={fe.errors.remarks}
              multiline
              maxLength={1000}
              editable={!busy}
            />
          </FormField>
        </CardSection>
        <CardSection icon={sym('paperclip', 'attach_file')} accent="amber" title="Receipts (optional)">
          <ThemedText type="small" themeColor="textSecondary">{`Up to ${MAX_PROOF_FILES} files, PDF, JPG or PNG, 5 MB each. Your approver can open them.`}</ThemedText>
          {form.existing.map((f) => (
            <View key={f.id} style={styles.row}>
              <ThemedText type="small" style={styles.grow} numberOfLines={1}>{`${f.fileName} · ${formatSize(f.sizeBytes)}`}</ThemedText>
              <PrimaryButton label="Open" variant="text" disabled={busy} onPress={() => void Linking.openURL(f.url)} />
              <PrimaryButton label="Remove" variant="text" disabled={busy} onPress={() => dropExisting(f)} />
            </View>
          ))}
          {form.files.map((f) => (
            <View key={f.uri} style={styles.row}>
              <ThemedText type="small" style={styles.grow} numberOfLines={1}>{`${f.name} · ${formatSize(f.sizeBytes)} · goes up when you save`}</ThemedText>
              <PrimaryButton label="Remove" variant="text" disabled={busy} onPress={() => setForm({ ...form, files: form.files.filter((x) => x.uri !== f.uri) })} />
            </View>
          ))}
          {form.existing.length + form.files.length < MAX_PROOF_FILES ? <PrimaryButton label="Attach a file" variant="text" disabled={busy} onPress={attach} /> : null}
        </CardSection>
      </ScreenShell>
    );
  }

  const canSend = statement?.canSubmit && !statement.submitLate && canChange;
  return (
    <ScreenShell
      title="Expenses"
      subtitle="Your month, date by date"
      onRefresh={list.reload}
      refreshing={list.refreshing}
      footer={canSend ? <PrimaryButton label="Send for approval" loading={busy} onPress={send} /> : null}>
      <FyBanner />
      <InfoCard>
        <ThemedText type="smallBold">Month</ThemedText>
        <MonthStepper value={month} onChange={(m) => (setMonth(m), setMsg(null))} min={fy.firstMonth} max={lastMonth} />
      </InfoCard>
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
          <StatusBanner
            accent={STATUS_ACCENT[statement.status]}
            icon={sym('doc.text', 'receipt_long')}
            title={`${prettyMonth(statement.month)} · ${STATUS_TEXT[statement.status]}`}
            text={`Total ${formatRupees(statement.totals.totalPaise)}${statement.paidPaise > 0 ? ` · Paid so far ${formatRupees(statement.paidPaise)}` : ''}`}
          />
          <SummaryStrip
            items={[
              { label: 'TA', value: formatRupees(statement.totals.taPaise), accent: 'blue' },
              { label: 'DA', value: formatRupees(statement.totals.daPaise), accent: 'teal' },
              { label: 'Other', value: formatRupees(statement.totals.otherPaise), accent: 'purple' },
            ]}
          />
          {statement.submittedTotals && statement.submittedTotals.totalPaise !== statement.totals.totalPaise ? (
            <Notice tone="warning">{`It was ${formatRupees(statement.submittedTotals.totalPaise)} when you sent it — TA/DA changed since.`}</Notice>
          ) : null}

          {statement.status === 'REJECTED' ? (
            <Notice tone="danger" title="Sent back by your approver">
              {rejectionText ?? 'No reason was given. Change what is needed and send it again.'}
            </Notice>
          ) : null}

          <View style={styles.row}>
            <View style={styles.grow}>
              <ThemedText type="smallBold" style={styles.sectionTitle}>Date by date</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">TA and DA are automatic; yours are “Other”</ThemedText>
            </View>
            {statement.editable && canChange ? <PrimaryButton label="+ Add expense" style={styles.newButton} disabled={busy} onPress={() => startForm()} /> : null}
          </View>

          {statement.days.length === 0 ? (
            <Notice tone="info">Nothing for this month yet.</Notice>
          ) : (
            statement.days.map((day) => (
              <InfoCard key={day.date}>
                <View style={styles.row}>
                  <ThemedText type="smallBold">{prettyDay(day.date)}</ThemedText>
                  <ThemedText type="smallBold">{formatRupees(day.totalPaise)}</ThemedText>
                </View>
                <ThemedText type="small" themeColor="textSecondary">{`TA ${formatRupees(day.taPaise)} · DA ${formatRupees(day.daPaise)} · Other ${formatRupees(day.otherPaise)}`}</ThemedText>
                {day.others.map((o) => (
                  <View key={o.id} style={styles.entry}>
                    <View style={styles.row}>
                      <ThemedText type="small" style={styles.grow}>{`${formatRupees(o.amountPaise)}${o.remarks ? ` · ${o.remarks}` : ''}`}</ThemedText>
                      {statement.editable && canChange ? (
                        <View style={styles.actions}>
                          <PrimaryButton label="Edit" variant="text" disabled={busy} onPress={() => startForm(day, o)} />
                          <PrimaryButton label="Remove" variant="text" disabled={busy} onPress={() => remove(o.id)} />
                        </View>
                      ) : null}
                    </View>
                    {(o.attachments ?? []).map((a) => (
                      <Pressable key={a.id} accessibilityRole="link" accessibilityLabel={`Open receipt ${a.fileName}`} onPress={() => void Linking.openURL(a.url)}>
                        <ThemedText type="small" themeColor="primary" numberOfLines={1}>{`Receipt: ${a.fileName} (${formatSize(a.sizeBytes)})`}</ThemedText>
                      </Pressable>
                    ))}
                  </View>
                ))}
              </InfoCard>
            ))
          )}

          {statement.editable && !statement.monthEnded ? (
            <Notice tone="info">{`You can send this month for approval from the 1st of next month${statement.deadlines ? `, by ${formatWhen(statement.deadlines.submitBy, timeZone)}` : ''}.`}</Notice>
          ) : null}
          {statement.monthEnded && statement.status !== 'APPROVED' && statement.deadlines ? (
            statement.exceptions.submitUntil ? (
              <Notice tone="warning" title="Allowed late">{`Allowed until ${formatWhen(statement.exceptions.submitUntil, timeZone)}.`}</Notice>
            ) : statement.submitLate ? (
              <Notice tone="danger" title="Deadline passed">{SUBMIT_LATE_TEXT}</Notice>
            ) : statement.status === 'DRAFT' || statement.status === 'REJECTED' ? (
              <Notice tone="info">{`Send by ${formatWhen(statement.deadlines.submitBy, timeZone)}.`}</Notice>
            ) : null
          ) : null}
          {statement.status === 'SUBMITTED' && statement.deadlines && !statement.exceptions.approveUntil && Date.parse(statement.deadlines.approveBy) < nowMs() ? (
            <Notice tone="warning">Approval is late — your manager has to ask Admin.</Notice>
          ) : null}
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
              <InfoCard>
                <View style={styles.row}>
                  <ThemedText type="smallBold">{prettyMonth(h.month)}</ThemedText>
                  <ThemedText type="smallBold">{formatRupees(h.totalPaise)}</ThemedText>
                </View>
                <ThemedText type="small" themeColor="textSecondary">{`TA ${formatRupees(h.taPaise)} · DA ${formatRupees(h.daPaise)} · Other ${formatRupees(h.otherPaise)}`}</ThemedText>
                <Pill text={STATUS_TEXT[h.status]} accent={STATUS_ACCENT[h.status]} />
              </InfoCard>
            </Pressable>
          ))}
        </>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1 },
  entry: { gap: Spacing.half },
  actionsCol: { gap: Spacing.two },
  sectionTitle: { fontSize: 18, lineHeight: 24 },
  newButton: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.two + 2 },
  loading: { gap: Spacing.three },
  actions: { flexDirection: 'row', gap: Spacing.one },
});
