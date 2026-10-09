import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useDayGate } from '@/hooks/use-day-gate';
import { useReportSent } from '@/hooks/use-report-sent';
import { formatRupees, rupeesToPaise } from '@/lib/money';
import { removeRecord, saveCall, useRecords, type ExpensePayload, type ExpenseType, type OutboxRecord } from '@/offline';

const TYPES: { value: ExpenseType; label: string }[] = [
  { value: 'TRAVEL', label: 'Travel' },
  { value: 'MEAL', label: 'Meal' },
  { value: 'MISC', label: 'Other' },
];

const TYPE_LABEL: Record<ExpenseType, string> = { TRAVEL: 'Travel', MEAL: 'Meal', MISC: 'Other' };

const STATUS_TEXT: Record<OutboxRecord['status'], string> = {
  DRAFT: 'Saved on this phone',
  QUEUED: 'Ready to send',
  SYNCED: 'Sent',
  FAILED: 'Not accepted',
};

/**
 * Expenses (PRD §6.2.E): travel, meals and other costs you paid for the day. Typed in rupees, kept as
 * whole paise. TA and DA are worked out by the server from your routes and are never entered here.
 * Saved on the phone and sent with Final Submission, so it works offline.
 */
export default function ExpensesScreen() {
  const gate = useDayGate();
  const reportSent = useReportSent(gate.today);
  const { records } = useRecords(['EXPENSE']);

  const [editing, setEditing] = useState<OutboxRecord | 'new' | null>(null);
  const [type, setType] = useState<ExpenseType>('TRAVEL');
  const [amount, setAmount] = useState('');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success'; text: string } | null>(null);

  const todays = records.filter((r) => !r.deleted && (r.payload as ExpensePayload).reportDate === gate.today);
  const total = todays.reduce((sum, r) => sum + (r.payload as ExpensePayload).amountPaise, 0);

  const start = (record: OutboxRecord | 'new') => {
    setMsg(null);
    if (record === 'new') {
      setType('TRAVEL');
      setAmount('');
      setRemarks('');
    } else {
      const p = record.payload as ExpensePayload;
      setType(p.type);
      setAmount(String(p.amountPaise / 100));
      setRemarks(p.remarks ?? '');
    }
    setEditing(record);
  };

  const save = async () => {
    const amountPaise = rupeesToPaise(amount);
    if (amountPaise === null) {
      setMsg({ tone: 'danger', text: 'Enter the amount in rupees, more than zero, with at most two decimals (for example 250 or 250.50).' });
      return;
    }
    setBusy(true);
    const payload: ExpensePayload = { reportDate: gate.today, type, amountPaise, remarks: remarks.trim() || null };
    try {
      await saveCall('EXPENSE', payload, editing && editing !== 'new' ? editing : undefined);
      setEditing(null);
      setMsg({ tone: 'success', text: 'Expense saved. It goes up with Final Submission.' });
    } catch (err) {
      setMsg({ tone: 'danger', text: err instanceof Error ? err.message : 'Could not save the expense.' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: OutboxRecord) => {
    try {
      await removeRecord(r.clientId);
    } catch (err) {
      setMsg({ tone: 'danger', text: err instanceof Error ? err.message : 'Could not remove it.' });
    }
  };

  if (gate.state !== 'open') {
    return (
      <ScreenShell title="Expenses">
        <Notice tone="warning" title="Not available right now">
          {gate.reason ?? 'Expenses open once today’s Tour Plan is approved.'}
        </Notice>
      </ScreenShell>
    );
  }

  if (editing) {
    return (
      <ScreenShell title={editing === 'new' ? 'New expense' : 'Edit expense'}>
        <View style={styles.block}>
          <ThemedText type="smallBold">Type</ThemedText>
          <ChoiceChips options={TYPES} value={type} onChange={setType} disabled={busy} />
        </View>
        <TextField
          label="Amount (₹)"
          value={amount}
          onChangeText={(t) => {
            setAmount(t.replace(/[^0-9.]/g, ''));
            setMsg(null);
          }}
          keyboardType="decimal-pad"
          placeholder="0.00"
          editable={!busy}
        />
        <TextField label="Remarks (optional)" value={remarks} onChangeText={setRemarks} multiline maxLength={1000} editable={!busy} />
        <Notice tone="info">TA and DA are worked out for you when your manager approves — don’t enter them here.</Notice>
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <PrimaryButton label="Save expense" loading={busy} onPress={save} />
        <PrimaryButton label="Cancel" variant="text" disabled={busy} onPress={() => setEditing(null)} />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title="Expenses">
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      {reportSent ? (
        <Notice tone="info" title="Today’s report is submitted">
          It can’t take more expenses unless your manager sends it back.
        </Notice>
      ) : (
        <PrimaryButton label="Add an expense" onPress={() => start('new')} />
      )}

      {todays.length === 0 ? (
        <Notice tone="info">No expenses logged today.</Notice>
      ) : (
        <>
          <ThemedText type="smallBold">{`Today · ${formatRupees(total)}`}</ThemedText>
          {todays.map((r) => {
            const p = r.payload as ExpensePayload;
            const editable = r.status === 'DRAFT' || r.status === 'FAILED';
            return (
              <ThemedView key={r.clientId} type="backgroundElement" style={styles.card}>
                <ThemedText type="smallBold">{`${TYPE_LABEL[p.type]} · ${formatRupees(p.amountPaise)}`}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {STATUS_TEXT[r.status]}
                </ThemedText>
                {p.remarks ? <ThemedText type="small">{p.remarks}</ThemedText> : null}
                {r.status === 'FAILED' && r.errorMessage ? (
                  <ThemedText type="small" themeColor="danger">
                    {r.errorMessage}
                  </ThemedText>
                ) : null}
                {editable ? (
                  <View style={styles.actions}>
                    <PrimaryButton label="Edit" variant="text" onPress={() => start(r)} />
                    <PrimaryButton label="Remove" variant="text" onPress={() => remove(r)} />
                  </View>
                ) : null}
              </ThemedView>
            );
          })}
        </>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  block: { gap: Spacing.two },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
  actions: { flexDirection: 'row', gap: Spacing.two },
});
