import { StyleSheet, View } from 'react-native';

import { Accents, Spacing, type Accent } from '@/constants/theme';
import type { PlanStatus } from '@/types/sync';

import { ThemedText } from './themed-text';

const BANNER: Record<PlanStatus | 'NONE', { title: string; text: string; accent: Accent; mark: string }> = {
  NONE: { title: 'Plan not started', text: 'Plan the days, then submit it for your manager’s approval.', accent: 'blue', mark: 'i' },
  DRAFT: { title: 'Draft saved', text: 'Review the days and submit it when ready.', accent: 'blue', mark: 'i' },
  // One approval (2026-10-23): the manager or Admin, whoever acts first. MANAGER_APPROVED only on older plans, and it means approved.
  SUBMITTED: { title: 'Waiting for approval', text: 'Your manager (or Admin) has been asked to approve this plan.', accent: 'blue', mark: 'i' },
  MANAGER_APPROVED: { title: 'Plan approved', text: 'This plan is approved.', accent: 'green', mark: '✓' },
  APPROVED: { title: 'Plan approved', text: 'This plan is approved.', accent: 'green', mark: '✓' },
  REJECTED: { title: 'Plan rejected', text: 'Update it and submit again.', accent: 'red', mark: '!' },
  WITHDRAWN: { title: 'Plan withdrawn', text: 'Review the days and submit it again when ready.', accent: 'amber', mark: '!' },
  REOPENED: { title: 'Plan reopened', text: 'Admin reopened it. Update it and submit again.', accent: 'amber', mark: '!' },
};

type Props = {
  status: PlanStatus | null;
  /** The manager's reason, when the plan was rejected. */
  rejection: string | null;
  /** "Submit by …", while a submit is still open. */
  deadlineText: string | null;
  /** Whole days until the deadline. */
  daysLeft: number | null;
};

/** The headline state of the plan, with the submit deadline beside it when there is one. */
export function PlanStatusBanner({ status, rejection, deadlineText, daysLeft }: Props) {
  const b = BANNER[status ?? 'NONE'];
  const colors = Accents[b.accent];
  const urgent = daysLeft !== null && daysLeft <= 3;

  return (
    <View style={[styles.card, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <View style={styles.main}>
        <View style={[styles.mark, { backgroundColor: colors.solid }]}>
          <ThemedText type="smallBold" style={styles.markText}>
            {b.mark}
          </ThemedText>
        </View>
        <View style={styles.text}>
          <ThemedText type="smallBold" style={styles.title}>
            {b.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
            {rejection ? `Reason: ${rejection}` : b.text}
          </ThemedText>
        </View>
      </View>
      {deadlineText ? (
        <View style={styles.deadline}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
            {deadlineText}
          </ThemedText>
          {daysLeft !== null ? (
            <View style={[styles.left, { backgroundColor: urgent ? Accents.red.solid : Accents.amber.solid }]}>
              <ThemedText type="smallBold" style={styles.leftText}>
                {daysLeft <= 0 ? 'Due today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
              </ThemedText>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.three, borderWidth: 1, padding: Spacing.three, gap: Spacing.two },
  main: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  mark: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  markText: { color: '#FFFFFF' },
  text: { flex: 1 },
  title: { fontSize: 15, lineHeight: 20 },
  note: { fontSize: 12, lineHeight: 17 },
  deadline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, flexWrap: 'wrap' },
  left: { borderRadius: 999, paddingVertical: 2, paddingHorizontal: 10 },
  leftText: { color: '#FFFFFF', fontSize: 11, lineHeight: 16 },
});
