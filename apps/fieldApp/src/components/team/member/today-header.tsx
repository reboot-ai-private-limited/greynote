import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { dailyPlanChip, reportChip, tourPlanChip, type BoardRow } from '@/lib/team-section';
import { prettyDay } from '@/offline/day';

import { ThemedText } from '../../themed-text';
import { Pill } from '../../ui-cards';
import { DoctorLines } from '../doctor-lines';

/** Reports that count as sent: the person finished the day. A draft is not one. */
const SENT = ['SUBMITTED', 'MANAGER_APPROVED', 'APPROVED'];

const planWords = (plan: NonNullable<BoardRow['plan']>) =>
  plan.routes.length > 0 ? plan.routes.map((r) => r.name).join(', ') : plan.workingType.replace(/_/g, ' ').toLowerCase();

/**
 * Today for one person, in three labelled lines: the Tour Plan (the month's, with today's route), the Daily plan (route, status and the
 * doctors by name, two shown and "+N more" to open the rest) and the Daily report (Yes with its status, which opens it in the Reports tab; or No).
 */
export function TodayHeader({ row, today, tourStatus, onOpenReport }: { row: BoardRow | null; today: string; tourStatus: string | null | undefined; onOpenReport: () => void }) {
  const [all, setAll] = useState(false);
  const tour = tourPlanChip(tourStatus);
  if (!row) return null;
  if (row.onLeave) return <ThemedText type="small" themeColor="textSecondary">{`${prettyDay(today)} · On leave today`}</ThemedText>;

  const plan = row.plan;
  const daily = dailyPlanChip(plan);
  const sent = !!row.report && SENT.includes(row.report.status);
  const report = reportChip(row.report?.status);
  const doctors = [...row.doctors.planned, ...row.doctors.alsoVisited];
  const first = row.doctors.planned.slice(0, 2);
  const more = doctors.length - first.length;

  return (
    <View style={styles.stack}>
      <ThemedText type="small" themeColor="textSecondary">{prettyDay(today)}</ThemedText>

      <View style={styles.line}>
        <ThemedText type="smallBold" style={styles.label}>Tour Plan</ThemedText>
        <ThemedText type="small" style={styles.grow}>{plan ? planWords(plan) : 'No route for today'}</ThemedText>
        <Pill text={tour.text.replace('Tour Plan ', '')} accent={tour.accent} />
      </View>

      <View style={styles.line}>
        <ThemedText type="smallBold" style={styles.label}>Daily plan</ThemedText>
        <ThemedText type="small" themeColor={plan ? 'text' : 'textSecondary'} style={styles.grow}>{plan && !plan.fromTourPlan ? planWords(plan) : plan ? 'Not sent yet' : 'No plan for today'}</ThemedText>
        {daily ? <Pill text={daily.text.replace('Daily plan ', '')} accent={daily.accent} /> : null}
      </View>
      {doctors.length > 0 ? (
        all ? (
          <View style={styles.indent}>
            <DoctorLines planned={row.doctors.planned} alsoVisited={row.doctors.alsoVisited} past={false} />
            <Pressable accessibilityRole="button" onPress={() => setAll(false)}>
              <ThemedText type="small" themeColor="primary">Show fewer ▴</ThemedText>
            </Pressable>
          </View>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel={more > 0 ? `Show all ${doctors.length} doctors` : 'Show doctors'} onPress={() => setAll(true)} style={styles.indent}>
            <ThemedText type="small">
              {first.map((d) => `${d.visited ? '✓' : '–'} ${d.name}`).join('   ')}
              {more > 0 ? <ThemedText type="small" themeColor="primary">{`   +${more} more ▾`}</ThemedText> : null}
            </ThemedText>
          </Pressable>
        )
      ) : null}

      <Pressable accessibilityRole={sent ? 'button' : 'text'} disabled={!sent} onPress={onOpenReport} style={styles.line}>
        <ThemedText type="smallBold" style={styles.label}>Daily report</ThemedText>
        <ThemedText type="small" themeColor={sent ? 'primary' : 'textSecondary'} style={styles.grow}>{sent ? `Yes · ${report.text.replace('Report ', '')} ›` : 'No'}</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.one },
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  label: { width: 92 },
  grow: { flex: 1 },
  indent: { paddingLeft: 92 + Spacing.two, gap: Spacing.one },
});
