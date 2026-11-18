import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { dailyPlanChip, reportChip, tourPlanChip, type DoctorLine } from '@/lib/team-section';
import { prettyDay } from '@/offline/day';

import { ThemedText } from '../../themed-text';
import { Pill } from '../../ui-cards';
import { DoctorLines } from '../doctor-lines';

/** Reports that count as sent: the person finished the day. A draft is not one. */
const SENT = ['SUBMITTED', 'MANAGER_APPROVED', 'APPROVED'];

export type DayLinesProps = {
  date: string;
  /** What the month's Tour Plan says for the day (route names or work type); `null` = nothing planned that day. */
  tourWords: string | null;
  /** The month's Tour Plan status (`null`/undefined = no Tour Plan). */
  tourStatus: string | null | undefined;
  /** The day's Daily Plan. A DRAFT is only what the Tour Plan wrote. */
  plan: { status: string; workingType: string; routes: { name: string }[] } | null;
  /** The submit time has passed, so an unsent draft reads "not submitted". */
  deadlinePassed: boolean;
  doctors: { planned: DoctorLine[]; alsoVisited: DoctorLine[] };
  report: { status: string } | null;
  onLeave?: boolean;
  /** Tapped on "Daily report: Yes". */
  onOpenReport?: (() => void) | undefined;
  /** Show the date above the lines (the Plans tab's blocks do; the header has a day picker instead). */
  showDate?: boolean;
};

const planWords = (plan: NonNullable<DayLinesProps['plan']>) => (plan.routes.length > 0 ? plan.routes.map((r) => r.name).join(', ') : plan.workingType.replace(/_/g, ' ').toLowerCase());

/**
 * One day for one person in three labelled lines: the **Tour Plan** (route, and the month's status), the **Daily plan** (route, status, and the doctors by
 * name, two shown and "+N more" to open the rest) and the **Daily report** (Yes with its status, which opens it; or No). Used by the person page's header
 * (for the day picked there) and by every block of its Plans tab, so both read the same.
 */
export function DayLines({ date, tourWords, tourStatus, plan, deadlinePassed, doctors: docs, report, onLeave, onOpenReport, showDate }: DayLinesProps) {
  const [all, setAll] = useState(false);
  if (onLeave) return <ThemedText type="small" themeColor="textSecondary">{`${prettyDay(date)} · On leave`}</ThemedText>;

  const tour = tourPlanChip(tourStatus);
  const draft = plan?.status === 'DRAFT';
  const daily = dailyPlanChip(plan ? { status: plan.status, deadlinePassed } : null);
  const sent = !!report && SENT.includes(report.status);
  const rep = reportChip(report?.status);
  const doctors = [...docs.planned, ...docs.alsoVisited];
  const first = docs.planned.slice(0, 2);
  const more = doctors.length - first.length;

  return (
    <View style={styles.stack}>
      {showDate ? <ThemedText type="smallBold">{prettyDay(date)}</ThemedText> : null}

      <View style={styles.line}>
        <ThemedText type="smallBold" style={styles.label}>Tour Plan</ThemedText>
        <ThemedText type="small" themeColor={tourWords ? 'text' : 'textSecondary'} style={styles.grow}>{tourWords ?? 'Nothing planned'}</ThemedText>
        <Pill text={tour.text.replace('Tour Plan ', '')} accent={tour.accent} />
      </View>

      <View style={styles.line}>
        <ThemedText type="smallBold" style={styles.label}>Daily plan</ThemedText>
        <ThemedText type="small" themeColor={plan && !draft ? 'text' : 'textSecondary'} style={styles.grow}>{plan && !draft ? planWords(plan) : plan ? 'Not sent yet' : 'No plan'}</ThemedText>
        {daily ? <Pill text={daily.text.replace('Daily plan ', '')} accent={daily.accent} /> : null}
      </View>
      {doctors.length > 0 ? (
        all ? (
          <View style={styles.indent}>
            <DoctorLines planned={docs.planned} alsoVisited={docs.alsoVisited} past={false} />
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

      <Pressable accessibilityRole={sent && onOpenReport ? 'button' : 'text'} disabled={!sent || !onOpenReport} onPress={onOpenReport} style={styles.line}>
        <ThemedText type="smallBold" style={styles.label}>Daily report</ThemedText>
        <ThemedText type="small" themeColor={sent ? 'primary' : 'textSecondary'} style={styles.grow}>{sent ? `Yes · ${rep.text.replace('Report ', '')}${onOpenReport ? ' ›' : ''}` : 'No'}</ThemedText>
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
