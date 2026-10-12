import { StyleSheet, View } from 'react-native';

import { Accents, Spacing, type Accent } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

export type PlanCounts = { workingDays: number; planned: number; field: number; meetings: number; others: number };

const TILES: { key: 'workingDays' | 'field' | 'meetings' | 'others'; label: string; accent: Accent }[] = [
  { key: 'workingDays', label: 'Working days', accent: 'blue' },
  { key: 'field', label: 'Field days', accent: 'green' },
  { key: 'meetings', label: 'Meetings', accent: 'indigo' },
  { key: 'others', label: 'Conference / strike', accent: 'amber' },
];

/** How much of the month is planned: a progress bar and four counts. */
export function PlanSummaryCard({ counts }: { counts: PlanCounts }) {
  const theme = useTheme();
  const ratio = counts.workingDays > 0 ? Math.min(1, counts.planned / counts.workingDays) : 0;

  return (
    <View style={[styles.card, { backgroundColor: theme.background, borderColor: theme.border }]}>
      <View style={styles.head}>
        <ThemedText type="smallBold" style={styles.title}>
          Plan summary
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {counts.planned}/{counts.workingDays} planned
        </ThemedText>
      </View>
      <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
        <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: Accents.green.solid }]} />
      </View>
      <View style={styles.grid}>
        {TILES.map((t) => (
          <View key={t.key} style={[styles.tile, { backgroundColor: Accents[t.accent].bg }]}>
            <ThemedText type="smallBold" style={[styles.count, { color: Accents[t.accent].solid }]}>
              {counts[t.key]}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.label} numberOfLines={2}>
              {t.label}
            </ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.three, borderWidth: 1, padding: Spacing.three, gap: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { fontSize: 16, lineHeight: 22 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.one },
  // Two per row: half the width, less half of the gap between them.
  tile: { width: '48.5%', flexGrow: 1, borderRadius: 12, padding: Spacing.three, gap: 2 },
  count: { fontSize: 24, lineHeight: 30 },
  label: { fontSize: 12, lineHeight: 16 },
});
