import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ApprovalHistory } from '@/components/approval-history';
import { ApprovalSummary } from '@/components/approval-summary';
import { FyBanner } from '@/components/fy-banner';
import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accents, Spacing, type Accent } from '@/constants/theme';
import { refreshIsManager } from '@/hooks/use-is-manager';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, NetworkError } from '@/lib/api';
import {
  LATE_APPROVAL_TEXT,
  approveRequest,
  getApproval,
  isLateApproval,
  kindLabel,
  rejectRequest,
  STATUS_LABEL,
  withdrawRequest,
  type ApprovalDetail,
  type ApprovalStatus,
} from '@/lib/approvals';
import { useFinancialYear } from '@/lib/financial-year';
import { useSessionUser } from '@/lib/session';
import { refreshNow, useOnline } from '@/offline';
import { formatWhen } from '@/offline/day';

const errorText = (err: unknown) =>
  err instanceof ApiError || err instanceof NetworkError ? err.message : 'Something went wrong. Please try again.';

type Step = null | 'approve' | 'reject' | 'withdraw';

/** The badge beside the employee: amber while it waits, green once approved, red when rejected. */
const STATUS_ACCENT: Record<ApprovalStatus, Accent> = {
  SUBMITTED: 'amber',
  MANAGER_APPROVED: 'amber',
  APPROVED: 'green',
  REJECTED: 'red',
  WITHDRAWN: 'slate',
  REOPENED: 'slate',
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/**
 * One request (PRD §7.3): who sent it, the record behind it, its history, and — when you may decide it — Reject (a reason is
 * required) and Approve (optional comment), pinned at the bottom. Each decision asks to be confirmed. The server decides on the
 * live state, so a request someone else already decided shows its message instead. The sender of a request still waiting can
 * Withdraw it (optional comment): the record becomes editable again. On a tablet a daily report lays out in two columns.
 */
export default function ApprovalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const online = useOnline();
  const fy = useFinancialYear();
  const [request, setRequest] = useState<ApprovalDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success'; text: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const me = useSessionUser();

  // Coming back from Amend (or any screen opened from here) shows the request as it now stands; the first focus is the initial load.
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focused.current) setReloadKey((k) => k + 1);
      focused.current = true;
    }, []),
  );

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
      else if (step === 'reject') await rejectRequest(request, comment);
      else await withdrawRequest(request.id, comment);
      refreshIsManager();
      // A withdrawn plan, leave or report is the sender's again — bring the phone's copy up to date.
      if (step === 'withdraw') void refreshNow();
      router.back();
    } catch (err) {
      const late = step === 'approve' && err instanceof ApiError && isLateApproval(err.status, err.message, err.data?.code);
      setMsg({ tone: 'danger', text: late ? LATE_APPROVAL_TEXT : errorText(err) });
      setStep(null);
      setReloadKey((k) => k + 1); // the request may have moved on; show its current state
    } finally {
      setBusy(false);
    }
  }, [request, step, comment]);

  const title = request ? kindLabel(request.kind) : 'Request';
  // A past financial year is read-only: the request can be read but not decided.
  const shown = request && fy.isPast ? { ...request, canAct: false } : request;
  const open = (s: Step) => {
    setMsg(null);
    setComment('');
    setStep(s);
  };

  const footer =
    shown?.canAct && !step ? (
      <View style={styles.footer}>
        <Pressable
          disabled={!online}
          accessibilityRole="button"
          onPress={() => open('reject')}
          style={[styles.footerButton, styles.reject, { borderColor: theme.border }, !online && styles.dim]}>
          <ThemedText type="smallBold" style={{ color: theme.danger }}>
            ✕  Reject
          </ThemedText>
        </Pressable>
        <Pressable
          disabled={!online}
          accessibilityRole="button"
          onPress={() => open('approve')}
          style={[styles.footerButton, styles.approve, { backgroundColor: Accents.green.solid }, !online && styles.dim]}>
          <ThemedText type="smallBold" themeColor="onPrimary">
            {request?.kind === 'DCR' ? '✓  Approve day' : '✓  Approve'}
          </ThemedText>
        </Pressable>
      </View>
    ) : null;

  const accent = request ? Accents[STATUS_ACCENT[request.status]] : Accents.slate;

  return (
    <ScreenShell title={title} subtitle="Review" wide footer={footer}>
      <FyBanner />
      {!online ? <Notice tone="info">You’re offline. Approvals need the internet.</Notice> : null}
      {loadError ? <Notice tone="danger">{loadError}</Notice> : null}
      {online && !request && !loadError ? <Skeleton cards={3} lines={4} /> : null}

      {request ? (
        <>
          <View style={[styles.who, { backgroundColor: '#EEF3FF', borderColor: '#D3E2FF' }]}>
            <View style={styles.avatar}>
              <ThemedText type="smallBold" style={styles.avatarText}>
                {request.submitter ? initials(request.submitter.name) : '?'}
              </ThemedText>
            </View>
            <View style={styles.whoText}>
              <View style={styles.nameRow}>
                <ThemedText type="smallBold" style={styles.name} numberOfLines={1}>
                  {request.submitter?.name ?? 'Unknown employee'}
                </ThemedText>
                {request.submitter ? (
                  <View style={[styles.code, { backgroundColor: theme.background }]}>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.codeText}>
                      {request.submitter.employeeCode}
                    </ThemedText>
                  </View>
                ) : null}
              </View>
              <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
                {`Sent ${formatWhen(request.submittedAt)}${request.cycle > 1 ? ` · round ${request.cycle}` : ''}`}
              </ThemedText>
              {request.overdue ? (
                <ThemedText type="small" themeColor="warning" style={styles.sub}>
                  Overdue
                </ThemedText>
              ) : null}
            </View>
            <View style={[styles.badge, { backgroundColor: accent.bg, borderColor: accent.border }]}>
              <ThemedText type="smallBold" style={[styles.badgeText, { color: request.status === 'REJECTED' ? theme.danger : accent.solid }]}>
                {STATUS_LABEL[request.status]}
              </ThemedText>
            </View>
          </View>

          {/* docs/mobile/monthlyplan.md M1: a waiting Tour Plan on your turn can be edited instead of rejected for a small fix. Above the
              month's day list, which is long. */}
          {request.kind === 'MONTHLY_PLAN' && request.status === 'SUBMITTED' && shown?.canAct && request.submitter && request.submitter.id !== me?.id && !step ? (
            <PrimaryButton
              label="Edit plan"
              variant="text"
              disabled={!online || busy}
              onPress={() => router.push({ pathname: '/amend-monthly-plan', params: { id: request.recordId, who: request.submitter?.name ?? '' } })}
            />
          ) : null}

          <ApprovalSummary key={reloadKey} request={shown ?? request} aside={<ApprovalHistory request={request} />} />

          {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

          {request.kind === 'DAILY_PLAN' && request.submitter && request.submitter.id !== me?.id && !fy.isPast ? (
            <PrimaryButton
              label="Amend this plan"
              variant="text"
              disabled={!online || busy}
              onPress={() => router.push({ pathname: '/amend-plan', params: { id: request.recordId, who: request.submitter?.name ?? '' } })}
            />
          ) : null}

          {shown?.canAct ? (
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
            ) : null
          ) : (
            <>
              <Notice tone="info">
                {fy.isPast
                  ? 'A past financial year is read-only.'
                  : request.canWithdraw
                  ? 'Waiting for a decision. You can withdraw it until then, and edit it again.'
                  : request.status === 'SUBMITTED' || request.status === 'MANAGER_APPROVED'
                  ? 'This request is view-only for you.'
                  : 'This request has already been decided.'}
              </Notice>
              {request.canWithdraw && !fy.isPast ? (
                step === 'withdraw' ? (
                  <ThemedView type="backgroundElement" style={styles.card}>
                    <ThemedText type="smallBold">Withdraw this request?</ThemedText>
                    <TextField label="Comment (optional)" value={comment} onChangeText={setComment} multiline maxLength={500} editable={!busy} />
                    <PrimaryButton label="Confirm withdraw" loading={busy} disabled={!online} onPress={decide} />
                    <PrimaryButton label="Back" variant="text" disabled={busy} onPress={() => setStep(null)} />
                  </ThemedView>
                ) : (
                  <PrimaryButton label="Withdraw request" variant="text" disabled={!online} onPress={() => open('withdraw')} />
                )
              ) : null}
            </>
          )}
        </>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
  who: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderRadius: Spacing.three, borderWidth: 1, padding: Spacing.three },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: Accents.blue.solid },
  avatarText: { color: '#FFFFFF', fontSize: 16, lineHeight: 22 },
  whoText: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  name: { flexShrink: 1, fontSize: 16, lineHeight: 22 },
  code: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  codeText: { fontSize: 11, lineHeight: 16 },
  sub: { fontSize: 12, lineHeight: 16 },
  badge: { borderRadius: 999, borderWidth: 1, paddingVertical: 4, paddingHorizontal: 10, maxWidth: 130 },
  badgeText: { fontSize: 11, lineHeight: 14, textAlign: 'center' },
  footer: { flexDirection: 'row', gap: Spacing.two },
  footerButton: { flex: 1, minHeight: 50, borderRadius: Spacing.two + 2, alignItems: 'center', justifyContent: 'center' },
  reject: { borderWidth: 1 },
  approve: { flex: 1.6 },
  dim: { opacity: 0.5 },
});
