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
import { ChoiceChips } from '@/components/choice-chips';
import { ExcelButton } from '@/components/report-kit';
import { CardSection, CollapsibleSection, InfoCard, Pill, sym } from '@/components/ui-cards';
import { Alert } from '@/lib/alert';
import { rupees } from '@/lib/xlsx';
import { Accents, Spacing, type Accent } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
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
import { formatSize, pickProofFile, takeProofPhoto, type PickedProof } from '@/lib/proof-picker';
import { getRejectionReason } from '@/lib/planning';
import { useSessionUser } from '@/lib/session';
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
  const me = useSessionUser();
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

  const theme = useTheme();
  const [form, setForm] = useState<Form | null>(null);
  // The days list (2026-11-28): every day, or only the days with your own expenses; one day opens to show its entries.
  const [onlyMine, setOnlyMine] = useState(false);
  const [openDay, setOpenDay] = useState<string | null>(null);
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

  const photo = async () => {
    if (!form) return;
    if (form.existing.length + form.files.length >= MAX_PROOF_FILES) return setMsg({ tone: 'danger', text: `You can attach at most ${MAX_PROOF_FILES} files. Remove one first.` });
    const taken = await takeProofPhoto();
    if (!taken) return;
    if (taken.error) return setMsg({ tone: 'danger', text: taken.error });
    if (taken.file) {
      setMsg(null);
      setForm({ ...form, files: [...form.files, taken.file] });
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

  /** Deletes one of your expenses, after asking (it can't be undone). */
  const remove = (entry: { id: string; amountPaise: number; remarks: string | null }) =>
    Alert.alert(`Delete ${formatRupees(entry.amountPaise)}${entry.remarks ? ` · ${entry.remarks}` : ''}?`, 'This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void removeNow(entry.id) },
    ]);
  const removeNow = async (id: string) => {
    setBusy(true);
    try {
      await removeOther(id);
      setForm(null);
      setMsg({ tone: 'success', text: 'Deleted.' });
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
          <View style={styles.chips}>
            {form.existing.map((f) => (
              <View key={f.id} style={[styles.chip, { borderColor: theme.border }]}>
                <Pressable accessibilityRole="link" accessibilityLabel={`Open ${f.fileName}`} onPress={() => void Linking.openURL(f.url)} style={styles.chipText}>
                  <ThemedText type="small" themeColor="primary" numberOfLines={1}>{`📎 ${f.fileName}`}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">{formatSize(f.sizeBytes)}</ThemedText>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${f.fileName}`} hitSlop={8} disabled={busy} onPress={() => void dropExisting(f)}>
                  <ThemedText type="smallBold" themeColor="danger">✕</ThemedText>
                </Pressable>
              </View>
            ))}
            {form.files.map((f) => (
              <View key={f.uri} style={[styles.chip, { borderColor: theme.border }]}>
                <View style={styles.chipText}>
                  <ThemedText type="small" numberOfLines={1}>{`📎 ${f.name}`}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">{`${formatSize(f.sizeBytes)} · goes up on Save`}</ThemedText>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${f.name}`} hitSlop={8} disabled={busy} onPress={() => setForm({ ...form, files: form.files.filter((x) => x.uri !== f.uri) })}>
                  <ThemedText type="smallBold" themeColor="danger">✕</ThemedText>
                </Pressable>
              </View>
            ))}
          </View>
          {form.existing.length + form.files.length < MAX_PROOF_FILES ? (
            <View style={styles.actions}>
              <View style={styles.grow}>
                <PrimaryButton label="Add file" variant="text" disabled={busy} onPress={attach} />
              </View>
              <View style={styles.grow}>
                <PrimaryButton label="Take photo" variant="text" disabled={busy} onPress={photo} />
              </View>
            </View>
          ) : null}
        </CardSection>
        {form.id ? <PrimaryButton label="Delete this expense" variant="text" disabled={busy} onPress={() => remove({ id: form.id!, amountPaise: rupeesToPaise(form.amount) ?? 0, remarks: form.remarks.trim() || null })} /> : null}
      </ScreenShell>
    );
  }

  const canSend = statement?.canSubmit && !statement.submitLate && canChange;

  /** Where the month stands against its deadlines, in one line for the month card (and the footer when it can't be sent). */
  const deadlineLine = (st: ExpenseStatement): { tone: 'info' | 'warning' | 'danger'; text: string } | null => {
    if (st.status === 'APPROVED') return null;
    if (st.status === 'SUBMITTED') {
      return st.deadlines && !st.exceptions.approveUntil && Date.parse(st.deadlines.approveBy) < nowMs() ? { tone: 'warning', text: 'Approval is late — your manager has to ask Admin.' } : null;
    }
    if (!st.monthEnded) return { tone: 'info', text: `You can send it from the 1st of next month${st.deadlines ? `, by ${formatWhen(st.deadlines.submitBy, timeZone)}` : ''}.` };
    if (st.exceptions.submitUntil) return { tone: 'warning', text: `Allowed late until ${formatWhen(st.exceptions.submitUntil, timeZone)}.` };
    if (st.submitLate) return { tone: 'danger', text: SUBMIT_LATE_TEXT };
    return st.deadlines ? { tone: 'info', text: `Send by ${formatWhen(st.deadlines.submitBy, timeZone)}.` } : null;
  };
  const deadline = statement ? deadlineLine(statement) : null;
  const days = (statement?.days ?? []).filter((d) => !onlyMine || d.others.length > 0);
  const mineCount = (statement?.days ?? []).filter((d) => d.others.length > 0).length;

  return (
    <ScreenShell
      title="Expenses"
      subtitle="Your month, date by date"
      onRefresh={list.reload}
      refreshing={list.refreshing}
      footer={
        statement && !fy.isPast ? (
          canSend ? (
            <PrimaryButton label={`Send ${formatRupees(statement.totals.totalPaise)} for approval`} loading={busy} onPress={send} />
          ) : deadline && (statement.status === 'DRAFT' || statement.status === 'REJECTED') ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>{deadline.text}</ThemedText>
          ) : null
        ) : null
      }>
      <FyBanner />
      <InfoCard>
        <MonthStepper value={month} onChange={(m) => (setMonth(m), setMsg(null), setOpenDay(null))} min={fy.firstMonth} max={lastMonth} />
      </InfoCard>
      {!online ? <Notice tone="info">You’re offline. You can read the last copy; adding, changing and sending need the internet.</Notice> : null}
      {list.stale && list.fetchedAt && statement && (!online || list.error) ? <Notice tone="info">{`Showing the copy from ${formatWhen(list.fetchedAt)}.`}</Notice> : null}
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      {list.error && online ? <Notice tone="danger">{list.error}</Notice> : null}
      {!statement && online && !list.error ? (
        <View style={styles.loading}>
          <Skeleton cards={1} lines={3} />
          <Skeleton cards={3} lines={1} />
        </View>
      ) : null}
      {!statement && !online ? <Notice tone="info">Connect once to load this month.</Notice> : null}

      {statement ? (
        <>
          {/* Everything about the month in one card (2026-11-28): status, total and its parts, paid, the deadline, why it was sent back. */}
          <View style={[styles.monthCard, { backgroundColor: Accents[STATUS_ACCENT[statement.status]].bg, borderColor: Accents[STATUS_ACCENT[statement.status]].border }]}>
            <View style={styles.row}>
              <ThemedText type="smallBold" style={styles.grow}>{prettyMonth(statement.month)}</ThemedText>
              <Pill text={STATUS_TEXT[statement.status].split(' — ')[0]!} accent={STATUS_ACCENT[statement.status]} />
            </View>
            <ThemedText type="title" style={[styles.total, { color: Accents[STATUS_ACCENT[statement.status]].solid }]}>{formatRupees(statement.totals.totalPaise)}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {`TA ${formatRupees(statement.totals.taPaise)} · DA ${formatRupees(statement.totals.daPaise)} · Other ${formatRupees(statement.totals.otherPaise)}${statement.paidPaise > 0 ? ` · Paid ${formatRupees(statement.paidPaise)}` : ''}`}
            </ThemedText>
            {deadline ? <ThemedText type="small" themeColor={deadline.tone === 'danger' ? 'danger' : deadline.tone === 'warning' ? 'warning' : 'textSecondary'}>{deadline.text}</ThemedText> : null}
            {statement.submittedTotals && statement.submittedTotals.totalPaise !== statement.totals.totalPaise ? (
              <ThemedText type="small" themeColor="warning">{`It was ${formatRupees(statement.submittedTotals.totalPaise)} when you sent it — TA/DA changed since.`}</ThemedText>
            ) : null}
            {statement.status === 'REJECTED' ? <ThemedText type="small" themeColor="danger">{`Sent back: ${rejectionText ?? 'no reason was given. Change what is needed and send it again.'}`}</ThemedText> : null}
          </View>

          <View style={styles.row}>
            {statement.editable && canChange ? (
              <PrimaryButton label="+ Add expense" style={styles.newButton} disabled={busy} onPress={() => startForm()} />
            ) : (
              <ThemedText type="small" themeColor="textSecondary" style={styles.grow}>TA and DA are automatic; yours are “Other”.</ThemedText>
            )}
            <ExcelButton
              fileName={`GREYNOTE EXPENSES ${statement.month} ${(me?.name ?? 'Me').replace(/[^\w .-]/g, '').trim()}.xlsx`}
              disabled={statement.days.length === 0}
              sheet={() => ({
                sheet: `Expenses ${statement.month}`,
                title: `${me?.name ?? ''} · Expenses · ${prettyMonth(statement.month)} · ${STATUS_TEXT[statement.status]}`,
                header: ['Date', 'TA (₹)', 'DA (₹)', 'Other (₹)', 'Total (₹)', 'Your expenses'],
                rows: statement.days.map((d) => [d.date, rupees(d.taPaise), rupees(d.daPaise), rupees(d.otherPaise), rupees(d.totalPaise), d.others.map((o) => `${o.amountPaise / 100} ${o.remarks ?? ''}`.trim()).join('; ')]),
                totals: ['Total', rupees(statement.totals.taPaise), rupees(statement.totals.daPaise), rupees(statement.totals.otherPaise), rupees(statement.totals.totalPaise), ''],
              })}
            />
          </View>

          {statement.days.length > 0 ? (
            <ChoiceChips
              options={[
                { value: 'all', label: `All days · ${statement.days.length}` },
                { value: 'mine', label: `Only my expenses · ${mineCount}` },
              ]}
              value={onlyMine ? 'mine' : 'all'}
              onChange={(v) => setOnlyMine(v === 'mine')}
            />
          ) : null}

          {statement.days.length === 0 ? (
            <Notice tone="info">Nothing for this month yet.</Notice>
          ) : days.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">You added no expenses of your own this month.</ThemedText>
          ) : (
            <View style={styles.days}>
              {days.map((day) => {
                const mine = day.others.length > 0;
                const isOpen = openDay === day.date;
                return (
                  <View key={day.date} style={[styles.day, { borderColor: isOpen ? theme.primary : theme.border, backgroundColor: theme.background }]}>
                    <Pressable
                      accessibilityRole={mine ? 'button' : undefined}
                      accessibilityState={mine ? { expanded: isOpen } : undefined}
                      disabled={!mine}
                      onPress={() => setOpenDay(isOpen ? null : day.date)}
                      style={styles.dayHead}>
                      <View style={styles.grow}>
                        <View style={styles.inline}>
                          <ThemedText type="smallBold">{prettyDay(day.date)}</ThemedText>
                          {mine ? <Pill text={`${day.others.length} yours`} accent="purple" /> : null}
                        </View>
                        <ThemedText type="small" themeColor="textSecondary">{`TA ${formatRupees(day.taPaise)} · DA ${formatRupees(day.daPaise)}${day.otherPaise ? ` · Other ${formatRupees(day.otherPaise)}` : ''}`}</ThemedText>
                      </View>
                      <ThemedText type="smallBold">{formatRupees(day.totalPaise)}</ThemedText>
                      {mine ? <ThemedText type="small" themeColor="textSecondary">{isOpen ? '▴' : '▾'}</ThemedText> : null}
                    </Pressable>
                    {isOpen
                      ? day.others.map((o) => (
                          <View key={o.id} style={[styles.entry, { borderTopColor: theme.border }]}>
                            <View style={styles.row}>
                              <ThemedText type="smallBold">{formatRupees(o.amountPaise)}</ThemedText>
                              <ThemedText type="small" style={styles.grow} numberOfLines={2}>{o.remarks ?? ''}</ThemedText>
                            </View>
                            {(o.attachments ?? []).length > 0 ? (
                              <View style={styles.chips}>
                                {(o.attachments ?? []).map((a) => (
                                  <Pressable key={a.id} accessibilityRole="link" accessibilityLabel={`Open receipt ${a.fileName}`} onPress={() => void Linking.openURL(a.url)} style={[styles.chip, { borderColor: theme.border }]}>
                                    <ThemedText type="small" themeColor="primary" numberOfLines={1}>{`📎 ${a.fileName}`}</ThemedText>
                                  </Pressable>
                                ))}
                              </View>
                            ) : null}
                            {statement.editable && canChange ? (
                              <View style={styles.actions}>
                                <PrimaryButton label="Edit" variant="text" disabled={busy} onPress={() => startForm(day, o)} />
                                <PrimaryButton label="Delete" variant="text" disabled={busy} onPress={() => remove(o)} />
                              </View>
                            ) : null}
                          </View>
                        ))
                      : null}
                  </View>
                );
              })}
            </View>
          )}
        </>
      ) : null}

      {history.length > 0 ? (
        <CollapsibleSection icon={sym('clock.arrow.circlepath', 'history')} accent="slate" title="Previous months" count={history.length} summary={history.slice(0, 3).map((h) => `${prettyMonth(h.month)} ${formatRupees(h.totalPaise)}`).join(' · ')}>
          {history.map((h) => (
            <Pressable key={h.month} accessibilityRole="button" onPress={() => (setMonth(h.month), setMsg(null), setOpenDay(null))} style={[styles.day, styles.dayHead, { borderColor: theme.border }]}>
              <View style={styles.grow}>
                <ThemedText type="smallBold">{prettyMonth(h.month)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{`TA ${formatRupees(h.taPaise)} · DA ${formatRupees(h.daPaise)} · Other ${formatRupees(h.otherPaise)}`}</ThemedText>
              </View>
              <View style={styles.right}>
                <ThemedText type="smallBold">{formatRupees(h.totalPaise)}</ThemedText>
                <Pill text={STATUS_TEXT[h.status].split(' — ')[0]!} accent={STATUS_ACCENT[h.status]} />
              </View>
            </Pressable>
          ))}
        </CollapsibleSection>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  inline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1 },
  right: { alignItems: 'flex-end', gap: 4 },
  center: { textAlign: 'center' },
  monthCard: { borderWidth: 1, borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
  total: { fontSize: 30, lineHeight: 36 },
  days: { gap: Spacing.two },
  day: { borderWidth: 1, borderRadius: Spacing.three, overflow: 'hidden' },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2 },
  entry: { gap: Spacing.one, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 1, borderRadius: Spacing.two, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, maxWidth: '100%' },
  chipText: { flexShrink: 1 },
  actionsCol: { gap: Spacing.two },
  sectionTitle: { fontSize: 18, lineHeight: 24 },
  newButton: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.two + 2 },
  loading: { gap: Spacing.three },
  actions: { flexDirection: 'row', gap: Spacing.one },
});
