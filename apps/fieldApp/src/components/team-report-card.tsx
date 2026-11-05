import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { InfoCard, Pill } from '@/components/ui-cards';
import { Spacing } from '@/constants/theme';
import { ApiError, NetworkError } from '@/lib/api';
import { withdrawRequest } from '@/lib/approvals';
import { formatRupees } from '@/lib/money';
import { getRejectionReason } from '@/lib/planning';
import {
  ROLLUP_STATUS_ACCENT,
  ROLLUP_STATUS_TEXT,
  submitSecondaryRollup,
  type SecondaryRollup,
} from '@/lib/stock-counts';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { prettyMonth } from '@/offline/day';

const errorText = (err: unknown) => {
  if (err instanceof ApiError) {
    switch (err.data?.code) {
      case 'MANAGER_ONLY':
        return 'Only a manager can send a team report.';
      case 'SECONDARY_NOTHING_TO_SEND':
        return 'None of your MRs has an approved report for this month yet.';
      case 'SECONDARY_LOCKED':
        return 'The team report is waiting for approval or approved, so it can’t be sent again. Withdraw it first.';
      default:
        return err.message;
    }
  }
  return err instanceof NetworkError ? err.message : 'Something went wrong. Please try again.';
};

const SOURCE_TEXT: Record<string, string> = {
  APPROVED: 'Approved',
  SUBMITTED: 'Waiting for approval',
  NOT_SUBMITTED: 'Not sent',
  DRAFT: 'Draft',
  REJECTED: 'Sent back',
};

/** The team report's figures, read-only: one block per MR (with their status) and the distributor totals. Used by the manager and by the upper manager's approval card. */
export function TeamReportFigures({ data }: { data: SecondaryRollup }) {
  return (
    <View style={styles.stack}>
      <ThemedText type="smallBold">{`${data.approvedMrCount} of ${data.mrCount} MRs approved`}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {`Units ${data.totals.issuedQty} · Value ${formatRupees(data.totals.issuedAmountPaise)}`}
      </ThemedText>
      {data.sources.map((s) => (
        <View key={s.recordId} style={styles.between}>
          <View style={styles.grow}>
            <ThemedText type="small">{s.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {s.status === 'APPROVED' ? `Opening ${s.openingQty} · Primary ${s.primaryQty} · Secondary ${s.issuedQty}` : SOURCE_TEXT[s.status] ?? s.status}
            </ThemedText>
          </View>
          <Pill text={SOURCE_TEXT[s.status] ?? s.status} accent={s.status === 'APPROVED' ? 'green' : s.status === 'REJECTED' ? 'red' : s.status === 'NOT_SUBMITTED' ? 'slate' : 'amber'} />
        </View>
      ))}
      {data.distributors.map((d) => (
        <View key={d.distributorId} style={styles.stack}>
          <View style={styles.between}>
            <ThemedText type="smallBold" style={styles.grow}>{d.name}</ThemedText>
            <ThemedText type="smallBold">{formatRupees(d.totals.issuedAmountPaise)}</ThemedText>
          </View>
          {d.lines
            .filter((l) => l.openingQty > 0 || l.primaryQty > 0 || l.issuedQty > 0)
            .map((l) => (
              <View key={l.product.id} style={styles.stack}>
                <ThemedText type="small">{l.product.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {`Opening ${l.openingQty} · Primary ${l.primaryQty} · Secondary ${l.issuedQty} · Closing ${l.closingQty}`}
                </ThemedText>
              </View>
            ))}
        </View>
      ))}
    </View>
  );
}

/**
 * The manager's own team report for the month: status chip, "6 of 8 MRs approved", an out-of-date notice, and Submit (enabled only when
 * the server says `canSubmit`). Withdraw while it waits; the reason shows if it was sent back. Until it is approved the manager's
 * achievement reads 0.
 */
export function TeamReportCard({ data, month, onChanged }: { data: SecondaryRollup; month: string; onChanged: () => void }) {
  const online = useOnline();
  const [busy, setBusy] = useState<'submit' | 'withdraw' | null>(null);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger' | 'info'; text: string } | null>(null);
  const rejected = data.status === 'REJECTED';
  const reason = useCachedFetch<string | null>(rejected && data.requestId ? `rollup-reason:${data.requestId}` : 'rollup-reason:none', async () =>
    rejected && data.requestId ? getRejectionReason(data.requestId) : null,
  );

  const submit = async () => {
    setBusy('submit');
    try {
      await submitSecondaryRollup(month);
      setMsg({ tone: 'success', text: 'Sent to your manager.' });
      onChanged();
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(null);
    }
  };
  const withdraw = async () => {
    if (!data.requestId) return;
    setBusy('withdraw');
    try {
      await withdrawRequest(data.requestId);
      setMsg({ tone: 'info', text: 'Withdrawn. You can send the report again.' });
      onChanged();
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <InfoCard>
      <View style={styles.between}>
        <ThemedText type="smallBold" style={styles.grow}>{`Your team report · ${prettyMonth(month)}`}</ThemedText>
        <Pill text={ROLLUP_STATUS_TEXT[data.status]} accent={ROLLUP_STATUS_ACCENT[data.status]} />
      </View>
      <ThemedText type="small">{`${data.approvedMrCount} of ${data.mrCount} MRs approved`}</ThemedText>
      {data.status !== 'APPROVED' ? (
        <ThemedText type="small" themeColor="textSecondary">Your achievement for the month reads 0 until this report is approved.</ThemedText>
      ) : null}
      {data.outOfDate ? (
        <Notice tone="warning" title="Out of date">
          An MR report changed after you sent this. Withdraw it and send again to include the change.
        </Notice>
      ) : null}
      {rejected ? <Notice tone="danger" title="Sent back">{reason.data ?? 'Send the report again.'}</Notice> : null}
      {data.status === 'PENDING' || (data.outOfDate && data.requestId && data.status !== 'APPROVED') ? (
        <PrimaryButton label="Withdraw" variant="text" loading={busy === 'withdraw'} disabled={!online || busy !== null} onPress={() => void withdraw()} />
      ) : null}
      {data.status !== 'PENDING' && data.status !== 'APPROVED' ? (
        <PrimaryButton label="Submit team report" loading={busy === 'submit'} disabled={!online || busy !== null || !data.canSubmit} onPress={() => void submit()} />
      ) : null}
      {!data.canSubmit && data.status !== 'PENDING' && data.status !== 'APPROVED' ? (
        <ThemedText type="small" themeColor="textSecondary">You can send it once at least one MR report is approved.</ThemedText>
      ) : null}
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
    </InfoCard>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.one },
  grow: { flex: 1 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
});
