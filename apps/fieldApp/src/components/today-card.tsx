import { router } from 'expo-router';
import { StyleSheet } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useDayGate } from '@/hooks/use-day-gate';

import { PrimaryButton } from './primary-button';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

const STATUS_TEXT: Record<string, string> = {
  APPROVED: 'Approved',
  MANAGER_APPROVED: 'Approved by your manager',
  SUBMITTED: 'Waiting for approval',
  DRAFT: 'Saved, not submitted',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
  REOPENED: 'Reopened',
};

function prettyDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
}

/** Today at a glance: the date, the Tour Plan's status, and the next step if there is one. */
export function TodayCard() {
  const gate = useDayGate();
  const blocked = gate.state === 'blocked';

  const plan =
    gate.state === 'unknown'
      ? 'Not loaded yet'
      : blocked
        ? 'Account blocked'
        : gate.planStatus
          ? (STATUS_TEXT[gate.planStatus] ?? gate.planStatus)
          : 'Not submitted';

  const needsPlan = gate.state === 'closed' && gate.planStatus !== 'SUBMITTED';

  return (
    <ThemedView type="backgroundElement" style={[styles.card, blocked && styles.blocked]}>
      <ThemedText type="small" themeColor="textSecondary">
        {prettyDate(gate.today)}
      </ThemedText>
      <ThemedText type="smallBold">Today’s Tour Plan: {plan}</ThemedText>
      {gate.reason ? (
        <ThemedText type="small" themeColor={blocked ? 'danger' : 'textSecondary'}>
          {gate.reason}
        </ThemedText>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          You can log calls and expenses for today.
        </ThemedText>
      )}
      {needsPlan ? (
        <PrimaryButton
          label="Go to Daily Plan"
          onPress={() => router.push('/daily-plan')}
        />
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  blocked: { borderWidth: 1, borderColor: '#D14343' },
});
