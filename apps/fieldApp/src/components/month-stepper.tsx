import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addMonths, prettyMonth } from '@/offline/day';

import { ThemedText } from './themed-text';

type Props = {
  /** `YYYY-MM` */
  value: string;
  onChange: (month: string) => void;
  /** Earliest and latest month it can reach. */
  min?: string;
  max?: string;
};

/** Steps a month with ‹ ›, stopping at the ends of `min` / `max`. The arrows are big, round buttons so a thumb can hit them. */
export function MonthStepper({ value, onChange, min, max }: Props) {
  const atMin = min !== undefined && value <= min;
  const atMax = max !== undefined && value >= max;
  return (
    <View style={styles.row}>
      <Arrow direction="left" label="Previous month" disabled={atMin} onPress={() => onChange(addMonths(value, -1))} />
      <ThemedText type="smallBold" style={styles.month}>
        {prettyMonth(value)}
      </ThemedText>
      <Arrow direction="right" label="Next month" disabled={atMax} onPress={() => onChange(addMonths(value, 1))} />
    </View>
  );
}

/** A chevron drawn from two borders, so it sits in the exact middle of the circle (a text glyph carries font padding). */
function Arrow({ direction, label, disabled, onPress }: { direction: 'left' | 'right'; label: string; disabled: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.arrow, { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement }, disabled && styles.disabled]}>
      <View style={[styles.chevron, { borderColor: theme.primary }, direction === 'left' ? styles.left : styles.right]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  month: { flex: 1, textAlign: 'center' },
  arrow: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  chevron: { width: 12, height: 12, borderLeftWidth: 3, borderBottomWidth: 3, borderRadius: 1 },
  // The two strokes sit toward the point, so nudge the shape back to the visual centre.
  left: { transform: [{ translateX: 3 }, { rotate: '45deg' }] },
  right: { transform: [{ translateX: -3 }, { rotate: '-135deg' }] },
  disabled: { opacity: 0.35 },
});
