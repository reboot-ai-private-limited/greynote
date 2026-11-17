import { StyleSheet, View } from 'react-native';

import { Accents, Spacing, type Accent } from '@/constants/theme';
import type { AttendanceStatus } from '@/lib/team-section';
import { weekdayOf } from '@/offline/day';

import { ThemedText } from '../../themed-text';

const STATUS: Record<AttendanceStatus, { label: string; accent: Accent | null }> = {
  PRESENT: { label: 'Present', accent: 'green' },
  LEAVE: { label: 'Leave', accent: 'purple' },
  ABSENT: { label: 'Absent', accent: 'red' },
  STRIKE: { label: 'Strike', accent: 'orange' },
  WEEKLY_OFF: { label: 'Weekly off', accent: 'slate' },
  HOLIDAY: { label: 'Holiday', accent: 'sky' },
  NOT_YET: { label: 'Not yet', accent: null },
  BEFORE_JOINING: { label: 'Before joining', accent: null },
  NOT_EMPLOYED: { label: 'Not employed', accent: null },
  UNKNOWN: { label: 'No data', accent: null },
};
const LEGEND: AttendanceStatus[] = ['PRESENT', 'LEAVE', 'ABSENT', 'STRIKE', 'WEEKLY_OFF', 'HOLIDAY'];
const HEADS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** A month as a grid of weeks (Monday first), one coloured cell per day, with a legend and the counts — like the admin web's attendance. */
export function AttendanceCalendar({ days, counts }: { days: { date: string; status: AttendanceStatus }[]; counts: Record<string, number> }) {
  if (days.length === 0) return null;
  // Monday = 0 … Sunday = 6.
  const lead = (weekdayOf(days[0]!.date) + 6) % 7;
  const cells: ({ date: string; status: AttendanceStatus } | null)[] = [...Array<null>(lead).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {HEADS.map((h, i) => (
          <View key={i} style={styles.cellBox}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.head}>{h}</ThemedText>
          </View>
        ))}
      </View>
      {weeks.map((w, wi) => (
        <View key={wi} style={styles.row}>
          {w.map((c, ci) => {
            const meta = c ? STATUS[c.status] : null;
            const tint = meta?.accent ? Accents[meta.accent] : null;
            return (
              <View key={ci} style={styles.cellBox}>
                {c ? (
                  <View style={[styles.cell, { backgroundColor: tint?.bg ?? 'transparent', borderColor: tint?.border ?? '#E2E8F0' }]} accessibilityLabel={`${c.date}: ${meta?.label}`}>
                    <ThemedText type="smallBold" style={{ color: tint?.solid ?? '#94A3B8', fontSize: 13 }}>{Number(c.date.slice(8))}</ThemedText>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
      <View style={styles.legend}>
        {LEGEND.map((s) => {
          const t = Accents[STATUS[s].accent!];
          return (
            <View key={s} style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: t.solid }]} />
              <ThemedText type="small">{`${STATUS[s].label} ${counts[s] ?? 0}`}</ThemedText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one },
  row: { flexDirection: 'row', gap: 4 },
  cellBox: { flex: 1, aspectRatio: 1, minHeight: 34 },
  cell: { flex: 1, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  head: { textAlign: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three, marginTop: Spacing.two },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
