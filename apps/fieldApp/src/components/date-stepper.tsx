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
  /** Also show « » to step a week at a time, for a date that can be far from today (a past leave). */
  weekSteps?: boolean;
};

/** Picks a day by stepping with ‹ › (one day), and optionally « » (one week) — no date-picker library, and every step lands on a real calendar day. */
export function DateStepper({ label, value, onChange, min, disabled, weekSteps }: Props) {
  const theme = useTheme();
  const atMin = min !== undefined && value <= min;
  /** Moves by `days`, never before `min`. */
  const go = (days: number) => {
    const next = addDays(value, days);
    onChange(min !== undefined && next < min ? min : next);
  };
  const back = disabled || atMin;
  return (
    <View style={styles.wrap}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <View style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
        {weekSteps ? (
          <Pressable accessibilityLabel={`${label}: one week earlier`} disabled={back} onPress={() => go(-7)} style={[styles.step, back && styles.dim]}>
            <ThemedText type="subtitle">«</ThemedText>
          </Pressable>
        ) : null}
        <Pressable accessibilityLabel={`${label}: one day earlier`} disabled={back} onPress={() => go(-1)} style={[styles.step, back && styles.dim]}>
          <ThemedText type="subtitle">‹</ThemedText>
        </Pressable>
        <ThemedText type="default" style={styles.value}>
          {prettyDay(value)}
        </ThemedText>
        <Pressable accessibilityLabel={`${label}: one day later`} disabled={disabled} onPress={() => go(1)} style={[styles.step, disabled && styles.dim]}>
          <ThemedText type="subtitle">›</ThemedText>
        </Pressable>
        {weekSteps ? (
          <Pressable accessibilityLabel={`${label}: one week later`} disabled={disabled} onPress={() => go(7)} style={[styles.step, disabled && styles.dim]}>
            <ThemedText type="subtitle">»</ThemedText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: Spacing.three, paddingVertical: Spacing.one },
  step: { width: 48, height: 44, alignItems: 'center', justifyContent: 'center' },
  value: { flex: 1, textAlign: 'center' },
  dim: { opacity: 0.35 },
});
