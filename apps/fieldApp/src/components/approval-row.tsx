import { Pressable, StyleSheet, View } from 'react-native';

import { Accents, Spacing, type Accent } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { kindLabel, STATUS_LABEL, type ApprovalItem, type ApprovalStatus } from '@/lib/approvals';
import { formatWhen } from '@/offline/day';

import { ThemedText } from './themed-text';

type Props = {
  item: ApprovalItem;
  onPress: () => void;
  /** Bulk mode: shows a check box and toggles on press. */
  selecting?: boolean;
  selected?: boolean;
  /** The caller's own request (My Requests): no sender line, and no "View only" — it is theirs to read, not to decide. */
  own?: boolean;
};

/** Each kind of request has its own colour, so a long list reads at a glance. */
const KIND_ACCENT: Record<string, Accent> = {
  DAILY_PLAN: 'blue',
  MONTHLY_PLAN: 'indigo',
  DCR: 'teal',
  LEAVE: 'pink',
  NEW_DOCTOR: 'purple',
  DOCTOR_SERVICE: 'orange',
  EXPENSE_MONTH: 'amber',
  SECONDARY_SALES: 'green',
};

const STATUS_ACCENT: Record<ApprovalStatus, Accent> = {
  SUBMITTED: 'amber',
  MANAGER_APPROVED: 'amber',
  APPROVED: 'green',
  REJECTED: 'red',
  WITHDRAWN: 'slate',
  REOPENED: 'slate',
};

/** In a manager's list the status is one or two words, so the person's name keeps its room. */
const STATUS_SHORT: Record<ApprovalStatus, string> = {
  SUBMITTED: 'Waiting',
  MANAGER_APPROVED: 'With Admin',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
  REOPENED: 'Reopened',
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** One request in a list: who sent it, what it is, when, and where it stands. */
export function ApprovalRow({ item, onPress, selecting, selected, own }: Props) {
  const theme = useTheme();
  const kind = Accents[KIND_ACCENT[item.kind] ?? 'slate'];
  const status = Accents[STATUS_ACCENT[item.status]];
  const name = item.submitter?.name ?? 'Unknown employee';

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <View style={[styles.card, { backgroundColor: theme.background, borderColor: selected ? theme.primary : theme.border }]}>
        {selecting ? (
          <View style={[styles.check, { borderColor: theme.border }, selected && { backgroundColor: theme.primary, borderColor: theme.primary }]}>
            {selected ? <ThemedText type="smallBold" themeColor="onPrimary">✓</ThemedText> : null}
          </View>
        ) : null}
        <View style={[styles.avatar, { backgroundColor: kind.bg }]}>
          <ThemedText type="smallBold" style={[styles.avatarText, { color: kind.solid }]}>
            {own ? kindLabel(item.kind).charAt(0).toUpperCase() : initials(name)}
          </ThemedText>
        </View>
        <View style={styles.body}>
          <View style={styles.topRow}>
            <View style={[styles.kind, { backgroundColor: kind.bg }]}>
              <ThemedText type="smallBold" style={[styles.kindText, { color: kind.solid }]}>
                {kindLabel(item.kind)}
              </ThemedText>
            </View>
            {item.overdue ? (
              <View style={[styles.kind, { backgroundColor: Accents.red.bg }]}>
                <ThemedText type="smallBold" style={[styles.kindText, { color: Accents.red.solid }]}>
                  Overdue
                </ThemedText>
              </View>
            ) : null}
          </View>
          {own ? null : (
            <ThemedText type="smallBold" numberOfLines={2}>
              {item.submitter ? item.submitter.name : 'Unknown employee'}
            </ThemedText>
          )}
          <ThemedText type="small" themeColor="textSecondary" style={styles.small}>
            {`${!own && item.submitter ? `${item.submitter.employeeCode} · ` : ''}Sent ${formatWhen(item.submittedAt)}`}
          </ThemedText>
          {own && item.status === 'REJECTED' && item.lastAction.comment ? (
            <ThemedText type="small" style={styles.small}>{`Reason: ${item.lastAction.comment}`}</ThemedText>
          ) : null}
        </View>
        <View style={styles.right}>
          <View style={[styles.badge, { backgroundColor: status.bg, borderColor: status.border }]}>
            <ThemedText type="smallBold" style={[styles.badgeText, { color: item.status === 'REJECTED' ? theme.danger : status.solid }]} numberOfLines={2}>
              {own ? STATUS_LABEL[item.status] : STATUS_SHORT[item.status]}
            </ThemedText>
          </View>
          {!item.canAct && !own ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.small}>
              View only
            </ThemedText>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.8 },
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderRadius: Spacing.three, borderWidth: 1, padding: Spacing.three },
  check: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, lineHeight: 18 },
  body: { flex: 1, gap: 2 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  kind: { borderRadius: 999, paddingVertical: 1, paddingHorizontal: 8 },
  kindText: { fontSize: 11, lineHeight: 16 },
  small: { fontSize: 12, lineHeight: 16 },
  right: { alignItems: 'flex-end', gap: 4, maxWidth: 110 },
  badge: { borderRadius: 999, borderWidth: 1, paddingVertical: 3, paddingHorizontal: 9 },
  badgeText: { fontSize: 11, lineHeight: 14, textAlign: 'center' },
});
