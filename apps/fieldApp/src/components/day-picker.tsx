import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addDays, addMonths, datesInMonth, monthOf, prettyDay, prettyMonth, weekdayOf } from '@/offline/day';

import { ThemedText } from './themed-text';

type Props = {
  /** YYYY-MM-DD */
  value: string;
  onChange: (iso: string) => void;
  /** Earliest day (YYYY-MM-DD). */
  min?: string | undefined;
  /** Latest day (YYYY-MM-DD). */
  max?: string | undefined;
};

const HEADS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * One day, picked two ways: ‹ › step a day, and tapping the date opens a month grid to jump anywhere in range.
 * Days outside `min`..`max` are greyed and cannot be chosen. No library: the grid is built from the same day helpers as the rest of the app.
 */
export function DayPicker({ value, onChange, min, max }: Props) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(monthOf(value));
  const atMin = min !== undefined && value <= min;
  const atMax = max !== undefined && value >= max;
  const clamp = (iso: string) => (min !== undefined && iso < min ? min : max !== undefined && iso > max ? max : iso);

  const toggle = () => {
    setShown(monthOf(value));
    setOpen((o) => !o);
  };

  const days = datesInMonth(shown);
  const lead = days.length > 0 ? (weekdayOf(days[0]!) + 6) % 7 : 0;
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  const prevOk = min === undefined || addMonths(shown, -1) >= monthOf(min);
  const nextOk = max === undefined || addMonths(shown, 1) <= monthOf(max);

  return (
    <View style={styles.wrap}>
      <View style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
        <Pressable accessibilityLabel="One day earlier" disabled={atMin} onPress={() => onChange(clamp(addDays(value, -1)))} style={[styles.step, atMin && styles.dim]}>
          <ThemedText type="subtitle">‹</ThemedText>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Pick a date" accessibilityState={{ expanded: open }} onPress={toggle} style={styles.value}>
          <ThemedText type="default">{`${prettyDay(value)} ${open ? '▴' : '▾'}`}</ThemedText>
        </Pressable>
        <Pressable accessibilityLabel="One day later" disabled={atMax} onPress={() => onChange(clamp(addDays(value, 1)))} style={[styles.step, atMax && styles.dim]}>
          <ThemedText type="subtitle">›</ThemedText>
        </Pressable>
      </View>

      {open ? (
        <View style={[styles.panel, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <View style={styles.monthRow}>
            <Pressable accessibilityLabel="Earlier month" disabled={!prevOk} onPress={() => setShown(addMonths(shown, -1))} style={[styles.step, !prevOk && styles.dim]}>
              <ThemedText type="subtitle">‹</ThemedText>
            </Pressable>
            <ThemedText type="smallBold" style={styles.value}>{prettyMonth(shown)}</ThemedText>
            <Pressable accessibilityLabel="Later month" disabled={!nextOk} onPress={() => setShown(addMonths(shown, 1))} style={[styles.step, !nextOk && styles.dim]}>
              <ThemedText type="subtitle">›</ThemedText>
            </Pressable>
          </View>
          <View style={styles.week}>
            {HEADS.map((h, i) => (
              <View key={i} style={styles.cellBox}>
                <ThemedText type="small" themeColor="textSecondary">{h}</ThemedText>
              </View>
            ))}
          </View>
          {weeks.map((w, wi) => (
            <View key={wi} style={styles.week}>
              {w.map((d, ci) => {
                const out = d !== null && ((min !== undefined && d < min) || (max !== undefined && d > max));
                const on = d === value;
                return (
                  <View key={ci} style={styles.cellBox}>
                    {d ? (
                      <Pressable
                        accessibilityLabel={prettyDay(d)}
                        accessibilityState={{ selected: on, disabled: out }}
                        disabled={out}
                        onPress={() => {
                          onChange(d);
                          setOpen(false);
                        }}
                        style={[styles.cell, on && { backgroundColor: theme.primary }, out && styles.dim]}>
                        <ThemedText type="small" themeColor={on ? 'onPrimary' : 'text'}>{Number(d.slice(8))}</ThemedText>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: Spacing.three, paddingVertical: Spacing.one },
  step: { width: 48, height: 44, alignItems: 'center', justifyContent: 'center' },
  value: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center', textAlign: 'center' },
  dim: { opacity: 0.3 },
  panel: { borderWidth: 1, borderRadius: Spacing.three, padding: Spacing.two, gap: 2 },
  monthRow: { flexDirection: 'row', alignItems: 'center' },
  week: { flexDirection: 'row' },
  cellBox: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  cell: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
