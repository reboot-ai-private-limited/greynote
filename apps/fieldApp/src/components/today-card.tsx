import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { Accents, Spacing } from '@/constants/theme';
import { useDayGate } from '@/hooks/use-day-gate';
import { useTheme } from '@/hooks/use-theme';

import { PrimaryButton } from './primary-button';
import { ThemedText } from './themed-text';

const CALENDAR: SymbolViewProps['name'] = { ios: 'calendar', android: 'event', web: 'event' } as SymbolViewProps['name'];

const STATUS_TEXT: Record<string, string> = {
  APPROVED: 'Approved',
  MANAGER_APPROVED: 'Approved by your manager',
  SUBMITTED: 'Waiting for approval',
  DRAFT: 'Saved, not submitted',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
  REOPENED: 'Reopened',
};

type Badge = { bg: string; fg: string };
const GREEN: Badge = { bg: Accents.green.bg, fg: '#15803D' };
const AMBER: Badge = { bg: Accents.amber.bg, fg: '#B45309' };
const RED: Badge = { bg: Accents.red.bg, fg: '#B91C1C' };
const GREY: Badge = { bg: Accents.slate.bg, fg: '#475569' };

const STATUS_BADGE: Record<string, Badge> = {
  APPROVED: GREEN,
  MANAGER_APPROVED: GREEN,
  SUBMITTED: AMBER,
  REJECTED: RED,
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
  const theme = useTheme();
  const blocked = gate.state === 'blocked';

  const plan =
    gate.state === 'unknown'
      ? 'Not loaded yet'
      : blocked
        ? 'Account blocked'
        : gate.planStatus
          ? (STATUS_TEXT[gate.planStatus] ?? gate.planStatus)
          : 'Not submitted';
  const badge = blocked ? RED : gate.planStatus ? (STATUS_BADGE[gate.planStatus] ?? GREY) : GREY;

  // A plan exists (written from the Monthly Plan) but still needs the doctors picked and a submit. With no plan there is nothing to open.
  const needsPlan = gate.state === 'closed' && gate.planStatus !== null && gate.planStatus !== 'SUBMITTED';

  return (
    <View style={[styles.card, { backgroundColor: theme.background, borderColor: blocked ? theme.danger : theme.border }]}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: Accents.green.bg }]}>
          <SymbolView name={CALENDAR} size={22} tintColor={Accents.green.solid} />
        </View>
        <View style={styles.text}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.date}>
            {prettyDate(gate.today)}
          </ThemedText>
          <ThemedText type="smallBold" style={styles.title}>
            Today’s Tour Plan
          </ThemedText>
        </View>
        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
          <ThemedText type="smallBold" style={[styles.badgeText, { color: badge.fg }]} numberOfLines={2}>
            {plan}
          </ThemedText>
        </View>
      </View>
      <ThemedText type="small" themeColor={blocked ? 'danger' : 'textSecondary'} style={styles.note}>
        {gate.reason ?? 'You can log calls and expenses for today.'}
      </ThemedText>
      {gate.cause === 'MONTHLY_PLAN' ? (
        <PrimaryButton
          label="Go to Tour Plan"
          onPress={() => router.push({ pathname: '/monthly-plan', params: { month: 'current' } })}
        />
      ) : needsPlan ? (
        <PrimaryButton
          label="Go to Daily Plan"
          onPress={() => router.push('/daily-plan')}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
  date: { fontSize: 12, lineHeight: 16 },
  title: { fontSize: 16, lineHeight: 22 },
  badge: { maxWidth: 128, borderRadius: 999, paddingVertical: Spacing.one, paddingHorizontal: Spacing.two + 2 },
  badgeText: { fontSize: 12, lineHeight: 16, textAlign: 'center' },
  note: { fontSize: 13, lineHeight: 18 },
});
