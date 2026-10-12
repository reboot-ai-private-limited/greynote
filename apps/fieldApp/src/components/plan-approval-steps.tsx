import { StyleSheet, View } from 'react-native';

import { Accents, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatWhen } from '@/offline/day';
import type { PlanStatus } from '@/types/sync';

import { ThemedText } from './themed-text';

type StepState = 'done' | 'current' | 'warning' | 'danger' | 'pending';
type Step = { title: string; note: string; state: StepState };

/** The plan's approval request: when it was submitted and decided (`GET /planning/monthly` row's `approval`). */
type ApprovalInfo = { cycle?: number; submittedAt?: string; decidedAt?: string | null } | null;

/** Where the plan stands, from its status, with the submit and decision times when the server has sent them. */
function stepsFor(status: PlanStatus | null, rejection: string | null, approval: ApprovalInfo, when: (iso: string) => string): Step[] {
  const sent = status === 'SUBMITTED' || status === 'MANAGER_APPROVED' || status === 'APPROVED' || status === 'REJECTED' || status === 'WITHDRAWN' || status === 'REOPENED';
  const approved = status === 'MANAGER_APPROVED' || status === 'APPROVED';
  const submittedNote = approval?.submittedAt
    ? `Sent ${when(approval.submittedAt)}${approval.cycle && approval.cycle > 1 ? ` (round ${approval.cycle})` : ''}`
    : 'Sent for approval';
  const decided = approval?.decidedAt ? ` · ${when(approval.decidedAt)}` : '';
  const steps: Step[] = [
    status ? { title: 'Draft saved', note: 'Your plan is saved', state: 'done' } : { title: 'Draft', note: 'Not started yet', state: 'current' },
    sent ? { title: 'Submitted to manager', note: submittedNote, state: 'done' } : { title: 'Submit to manager', note: 'Pending', state: 'pending' },
  ];
  if (status === 'WITHDRAWN') steps.push({ title: 'Withdrawn by you', note: 'Edit it and submit again', state: 'warning' });
  if (status === 'REOPENED') steps.push({ title: 'Reopened by Admin', note: 'Update it and submit again', state: 'warning' });
  steps.push(
    approved
      ? { title: 'Manager approval', note: `${status === 'APPROVED' ? 'Approved' : 'Approved by your manager'}${decided}`, state: 'done' }
      : status === 'REJECTED'
        ? { title: 'Rejected by manager', note: rejection ? `Reason: ${rejection}${decided}` : `Update it and submit again${decided}`, state: 'danger' }
        : { title: 'Manager approval', note: status === 'SUBMITTED' ? 'Waiting for a decision' : 'Pending', state: status === 'SUBMITTED' ? 'current' : 'pending' },
  );
  return steps;
}

const MARK: Record<StepState, string> = { done: '✓', current: '•', warning: '!', danger: '✕', pending: '' };

/** The plan's approval path as a vertical list of steps. */
export function PlanApprovalSteps({
  status,
  rejection,
  approval = null,
  timeZone,
}: {
  status: PlanStatus | null;
  rejection: string | null;
  approval?: ApprovalInfo;
  timeZone?: string | null;
}) {
  const theme = useTheme();
  const steps = stepsFor(status, rejection, approval, (iso) => formatWhen(iso, timeZone));
  const color: Record<StepState, string> = {
    done: Accents.green.solid,
    current: theme.primary,
    warning: Accents.amber.solid,
    danger: theme.danger,
    pending: theme.border,
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.background, borderColor: theme.border }]}>
      <ThemedText type="smallBold" style={styles.title}>
        Approval status
      </ThemedText>
      {steps.map((s, i) => (
        <View key={i} style={styles.step}>
          <View style={styles.rail}>
            <View style={[styles.mark, { backgroundColor: s.state === 'pending' ? theme.background : color[s.state], borderColor: color[s.state] }]}>
              <ThemedText type="smallBold" style={styles.markText}>
                {MARK[s.state]}
              </ThemedText>
            </View>
            {i < steps.length - 1 ? <View style={[styles.line, { backgroundColor: theme.border }]} /> : null}
          </View>
          <View style={styles.text}>
            <ThemedText type="smallBold" themeColor={s.state === 'pending' ? 'textSecondary' : 'text'}>
              {s.title}
            </ThemedText>
            <ThemedText type="small" themeColor={s.state === 'danger' ? 'danger' : 'textSecondary'} style={styles.note}>
              {s.note}
            </ThemedText>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.three, borderWidth: 1, padding: Spacing.three },
  title: { fontSize: 16, lineHeight: 22, marginBottom: Spacing.two },
  step: { flexDirection: 'row', gap: Spacing.three },
  rail: { alignItems: 'center', width: 22 },
  mark: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  markText: { color: '#FFFFFF', fontSize: 12, lineHeight: 16 },
  line: { width: 2, flex: 1, minHeight: 14 },
  text: { flex: 1, paddingBottom: Spacing.three },
  note: { fontSize: 12, lineHeight: 16 },
});
