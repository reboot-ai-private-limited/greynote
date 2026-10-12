import { StyleSheet, View } from 'react-native';

import { Accents, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { PlanStatus } from '@/types/sync';

import { ThemedText } from './themed-text';

type StepState = 'done' | 'current' | 'warning' | 'danger' | 'pending';
type Step = { title: string; note: string; state: StepState };

/** Where the plan stands, worked out from its status alone (the phone has no per-step dates). */
function stepsFor(status: PlanStatus | null, rejection: string | null): Step[] {
  const sent = status === 'SUBMITTED' || status === 'MANAGER_APPROVED' || status === 'APPROVED' || status === 'REJECTED' || status === 'WITHDRAWN' || status === 'REOPENED';
  const approved = status === 'MANAGER_APPROVED' || status === 'APPROVED';
  const steps: Step[] = [
    status ? { title: 'Draft saved', note: 'Your plan is saved', state: 'done' } : { title: 'Draft', note: 'Not started yet', state: 'current' },
    sent ? { title: 'Submitted to manager', note: 'Sent for approval', state: 'done' } : { title: 'Submit to manager', note: 'Pending', state: 'pending' },
  ];
  if (status === 'WITHDRAWN') steps.push({ title: 'Withdrawn by you', note: 'Edit it and submit again', state: 'warning' });
  if (status === 'REOPENED') steps.push({ title: 'Reopened by Admin', note: 'Update it and submit again', state: 'warning' });
  steps.push(
    approved
      ? { title: 'Manager approval', note: 'Approved', state: 'done' }
      : status === 'REJECTED'
        ? { title: 'Rejected by manager', note: rejection ? `Reason: ${rejection}` : 'Update it and submit again', state: 'danger' }
        : { title: 'Manager approval', note: status === 'SUBMITTED' ? 'Waiting for a decision' : 'Pending', state: status === 'SUBMITTED' ? 'current' : 'pending' },
  );
  return steps;
}

const MARK: Record<StepState, string> = { done: '✓', current: '•', warning: '!', danger: '✕', pending: '' };

/** The plan's approval path as a vertical list of steps. */
export function PlanApprovalSteps({ status, rejection }: { status: PlanStatus | null; rejection: string | null }) {
  const theme = useTheme();
  const steps = stepsFor(status, rejection);
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
