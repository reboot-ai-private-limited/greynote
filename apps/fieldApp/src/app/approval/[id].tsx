import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ApprovalSummary } from '@/components/approval-summary';
import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { Skeleton } from '@/components/skeleton';
import { ScreenShell } from '@/components/screen-shell';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { refreshIsManager } from '@/hooks/use-is-manager';
import { ApiError, NetworkError } from '@/lib/api';
import {
  approveRequest,
  getApproval,
  kindLabel,
  rejectRequest,
  STATUS_LABEL,
  type ApprovalAction,
  type ApprovalDetail,
} from '@/lib/approvals';
import { useOnline } from '@/offline';
import { formatWhen } from '@/offline/day';

const errorText = (err: unknown) =>
  err instanceof ApiError || err instanceof NetworkError ? err.message : 'Something went wrong. Please try again.';

const ACTION_TEXT: Record<ApprovalAction['action'], string> = {
  SUBMIT: 'Submitted',
  RESUBMIT: 'Sent again',
  APPROVE: 'Approved',
  REJECT: 'Rejected',
  WITHDRAW: 'Withdrawn',
  REOPEN: 'Reopened',
};

type Step = null | 'approve' | 'reject';

/**
 * One request (PRD §7.3): what it is, the record behind it, its history, and — when you may decide it —
 * Approve (optional comment) and Reject (a reason is required). Each decision asks to be confirmed. The
 * server decides on the live state, so a request someone else already decided shows its message instead.
 */
export default function ApprovalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const online = useOnline();
  const [request, setRequest] = useState<ApprovalDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success'; text: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!id || !online) return;
    let alive = true;
    getApproval(id)
      .then((r) => alive && (setRequest(r), setLoadError(null)))
      .catch((err) => alive && setLoadError(errorText(err)));
    return () => {
      alive = false;
    };
  }, [id, online, reloadKey]);

  const decide = useCallback(async () => {
    if (!request || !step) return;
    if (step === 'reject' && !comment.trim()) {
      setMsg({ tone: 'danger', text: 'Give the reason for rejecting — the employee will see it.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      if (step === 'approve') await approveRequest(request, comment);
      else await rejectRequest(request, comment);
      refreshIsManager();
      router.back();
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
      setStep(null);
      setReloadKey((k) => k + 1); // the request may have moved on; show its current state
    } finally {
      setBusy(false);
    }
  }, [request, step, comment]);

  const title = request ? kindLabel(request.kind) : 'Request';

  return (
    <ScreenShell title={title}>
      {!online ? <Notice tone="info">You’re offline. Approvals need the internet.</Notice> : null}
      {loadError ? <Notice tone="danger">{loadError}</Notice> : null}
      {online && !request && !loadError ? <Skeleton cards={3} lines={4} /> : null}

      {request ? (
        <>
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">{request.submitter ? `${request.submitter.name} · ${request.submitter.employeeCode}` : 'Unknown employee'}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{`Sent ${formatWhen(request.submittedAt)}${request.cycle > 1 ? ` · round ${request.cycle}` : ''}`}</ThemedText>
            <ThemedText type="small" themeColor={request.status === 'REJECTED' ? 'danger' : 'textSecondary'}>{STATUS_LABEL[request.status]}</ThemedText>
            {request.overdue ? <ThemedText type="small" themeColor="warning">Overdue</ThemedText> : null}
          </ThemedView>

          <ApprovalSummary request={request} />

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">History</ThemedText>
            {[...request.history].reverse().map((h, i) => (
              <View key={`${h.at}-${i}`} style={styles.history}>
                <ThemedText type="small">{`${ACTION_TEXT[h.action]}${h.actor ? ` · ${h.actor.name}` : ''}`}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{formatWhen(h.at)}</ThemedText>
                {h.comment ? <ThemedText type="small">{`“${h.comment}”`}</ThemedText> : null}
              </View>
            ))}
          </ThemedView>

          {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

          {request.canAct ? (
            step ? (
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="smallBold">{step === 'approve' ? 'Approve this request?' : 'Reject this request?'}</ThemedText>
                <TextField
                  label={step === 'approve' ? 'Comment (optional)' : 'Reason (required)'}
                  value={comment}
                  onChangeText={(t) => {
                    setComment(t);
                    setMsg(null);
                  }}
                  multiline
                  maxLength={500}
                  editable={!busy}
                />
                <PrimaryButton label={step === 'approve' ? 'Confirm approve' : 'Confirm reject'} loading={busy} disabled={!online} onPress={decide} />
                <PrimaryButton label="Back" variant="text" disabled={busy} onPress={() => setStep(null)} />
              </ThemedView>
            ) : (
              <View style={styles.actions}>
                <PrimaryButton label="Approve" disabled={!online} onPress={() => { setMsg(null); setComment(''); setStep('approve'); }} />
                <PrimaryButton label="Reject" variant="text" disabled={!online} onPress={() => { setMsg(null); setComment(''); setStep('reject'); }} />
              </View>
            )
          ) : (
            <Notice tone="info">
              {request.status === 'SUBMITTED' || request.status === 'MANAGER_APPROVED'
                ? 'This request is view-only for you.'
                : 'This request has already been decided.'}
            </Notice>
          )}
        </>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
  history: { gap: Spacing.half, paddingTop: Spacing.two },
  actions: { gap: Spacing.two },
});
