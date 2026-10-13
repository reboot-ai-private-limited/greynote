import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { WORKING_TYPES, type PlanDay } from '@/lib/planning';
import { OFF_COLORS, typeColors } from '@/lib/plan-style';
import { prettyMonth, weekdayOf } from '@/offline/day';

import { ThemedText } from './themed-text';

const HEADS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

type Props = {
  month: string;
  days: string[];
  entries: Record<string, PlanDay>;
  isOff: (date: string) => boolean;
  today: string;
  /** Set when the plan can be edited: tapping a working day opens it. */
  onPressDay?: (date: string) => void;
};

/** The month at a glance: each day coloured by what is planned on it. Rows are seven equal cells, so it fits a phone and a tablet alike. */
export function PlanCalendar({ month, days, entries, isOff, today, onPressDay }: Props) {
  const theme = useTheme();
  const blanks = days.length > 0 ? weekdayOf(days[0]!) : 0;
  const cells: (string | null)[] = [...Array.from({ length: blanks }, () => null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));

  return (
    <View style={[styles.card, { backgroundColor: theme.background, borderColor: theme.border }]}>
      <ThemedText type="smallBold" style={styles.title}>
        {prettyMonth(month)}
      </ThemedText>
      <View style={styles.week}>
        {HEADS.map((h, i) => (
          <View key={i} style={styles.cellBox}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.head}>
              {h}
            </ThemedText>
          </View>
        ))}
      </View>
      {weeks.map((week, w) => (
        <View key={w} style={styles.week}>
          {week.map((date, i) => {
            if (!date) return <View key={i} style={styles.cellBox} />;
            const entry = entries[date];
            const off = isOff(date);
            const colors = off ? OFF_COLORS : entry ? typeColors(entry.workingType) : null;
            const isToday = date === today;
            const tappable = Boolean(onPressDay) && !off;
            return (
              <View key={i} style={styles.cellBox}>
                <Pressable
                  disabled={!tappable}
                  accessibilityRole="button"
                  accessibilityLabel={date}
                  onPress={() => onPressDay?.(date)}
                  style={[
                    styles.cell,
                    {
                      backgroundColor: colors ? colors.bg : theme.backgroundElement,
                      borderColor: isToday ? theme.primary : colors ? colors.border : 'transparent',
                      borderWidth: isToday ? 2 : 1,
                    },
                  ]}>
                  <ThemedText
                    type="smallBold"
                    style={[styles.num, { color: colors ? colors.solid : theme.textSecondary }, off && styles.offNum]}>
                    {Number(date.slice(8))}
                  </ThemedText>
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}
      <View style={styles.legend}>
        {WORKING_TYPES.map((t) => (
          <View key={t.value} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: typeColors(t.value).solid }]} />
            <ThemedText type="small" themeColor="textSecondary" style={styles.legendText}>
              {t.label}
            </ThemedText>
          </View>
        ))}
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: OFF_COLORS.solid }]} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.legendText}>
            Off
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.three, borderWidth: 1, padding: Spacing.three, gap: Spacing.one },
  title: { fontSize: 16, lineHeight: 22, marginBottom: Spacing.one },
  week: { flexDirection: 'row' },
  // Seven equal columns; the padding makes the gap between cells.
  cellBox: { width: `${100 / 7}%`, padding: 2, minHeight: 20 },
  head: { textAlign: 'center', fontSize: 11, lineHeight: 16 },
  cell: { aspectRatio: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  num: { fontSize: 12, lineHeight: 16 },
  offNum: { opacity: 0.7 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.three, rowGap: Spacing.one, marginTop: Spacing.two },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, lineHeight: 16 },
});
