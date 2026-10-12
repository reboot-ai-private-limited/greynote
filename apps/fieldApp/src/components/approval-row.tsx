import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { kindLabel, STATUS_LABEL, type ApprovalItem } from '@/lib/approvals';
import { formatWhen } from '@/offline/day';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

type Props = {
  item: ApprovalItem;
  onPress: () => void;
  /** Bulk mode: shows a check box and toggles on press. */
  selecting?: boolean;
  selected?: boolean;
  /** The caller's own request (My Requests): no sender line, and no "View only" — it is theirs to read, not to decide. */
  own?: boolean;
};

/** One request in a list: what it is, who sent it, when, and where it stands. */
export function ApprovalRow({ item, onPress, selecting, selected, own }: Props) {
  const who = item.submitter ? `${item.submitter.name} · ${item.submitter.employeeCode}` : 'Unknown employee';
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <ThemedView type="backgroundElement" style={styles.card}>
        {selecting ? (
          <View style={[styles.check, selected && styles.checked]}>
            {selected ? <ThemedText type="smallBold" themeColor="onPrimary">✓</ThemedText> : null}
          </View>
        ) : null}
        <View style={styles.body}>
          <ThemedText type="smallBold">{kindLabel(item.kind)}</ThemedText>
          {own ? null : <ThemedText type="small">{who}</ThemedText>}
          <ThemedText type="small" themeColor="textSecondary">
            {`Sent ${formatWhen(item.submittedAt)}`}
          </ThemedText>
          <ThemedText type="small" themeColor={item.status === 'REJECTED' ? 'danger' : 'textSecondary'}>
            {STATUS_LABEL[item.status]}
          </ThemedText>
          {own && item.status === 'REJECTED' && item.lastAction.comment ? (
            <ThemedText type="small">{`Reason: ${item.lastAction.comment}`}</ThemedText>
          ) : null}
          {item.overdue ? (
            <ThemedText type="small" themeColor="warning">
              Overdue
            </ThemedText>
          ) : null}
          {!item.canAct && !own ? (
            <ThemedText type="small" themeColor="textSecondary">
              View only
            </ThemedText>
          ) : null}
        </View>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderRadius: Spacing.three, padding: Spacing.three },
  body: { flex: 1, gap: Spacing.half },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#9A9EA6', alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: '#208AEF', borderColor: '#208AEF' },
});
