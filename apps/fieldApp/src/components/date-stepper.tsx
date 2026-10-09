import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addDays, prettyDay } from '@/offline/day';

import { ThemedText } from './themed-text';

type Props = {
  label: string;
  /** YYYY-MM-DD */
  value: string;
  onChange: (iso: string) => void;
  /** Earliest day it can go back to. */
  min?: string;
  disabled?: boolean;
};

/** Picks a day by stepping with ‹ › — no date-picker library, and every step lands on a real calendar day. */
export function DateStepper({ label, value, onChange, min, disabled }: Props) {
  const theme = useTheme();
  const atMin = min !== undefined && value <= min;
  return (
    <View style={styles.wrap}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <View style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
        <Pressable
          accessibilityLabel={`${label}: one day earlier`}
          disabled={disabled || atMin}
          onPress={() => onChange(addDays(value, -1))}
          style={[styles.step, (disabled || atMin) && styles.dim]}>
          <ThemedText type="subtitle">‹</ThemedText>
        </Pressable>
        <ThemedText type="default" style={styles.value}>
          {prettyDay(value)}
        </ThemedText>
        <Pressable
          accessibilityLabel={`${label}: one day later`}
          disabled={disabled}
          onPress={() => onChange(addDays(value, 1))}
          style={[styles.step, disabled && styles.dim]}>
          <ThemedText type="subtitle">›</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: Spacing.three, paddingVertical: Spacing.one },
  step: { width: 52, height: 44, alignItems: 'center', justifyContent: 'center' },
  value: { flex: 1, textAlign: 'center' },
  dim: { opacity: 0.35 },
});
