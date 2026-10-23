import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import {
  isTripDay,
  routeNamesText,
  workingTypeLabel,
  type MonthlyPlanAmendment,
  type MonthlyPlanEntry,
  type NamedRoute,
} from '@/lib/planning';
import { formatWhen, prettyDay } from '@/offline/day';

import { PrimaryButton } from './primary-button';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

type Props = {
  amendments: MonthlyPlanAmendment[];
  /** The plan's days as they stand now: the last edit is compared with these. */
  entries: MonthlyPlanEntry[];
  /** The plan's named routes (`GET /planning/monthly/:id`), to name the routes of the old days. */
  routes?: NamedRoute[];
  /** The amender's name from their user id; null when the phone doesn't know them. */
  nameOf: (userId: string) => string | null;
  timeZone?: string;
  /** Who the editor is to the reader: "your manager" on the employee's own plan, "a manager" for an approver. */
  editor?: string;
};

const dayText = (d: MonthlyPlanEntry | undefined, routes: NamedRoute[] | undefined, nameOf: Props['nameOf']) =>
  d
    ? [
        workingTypeLabel(d.workingType),
        d.routeIds.length > 0 ? routeNamesText(d.routeIds, routes) : null,
        d.returnDate ? `trip, back ${prettyDay(d.returnDate)}` : null,
        d.workWith.length > 0 ? `with ${d.workWith.map((id) => nameOf(id) ?? 'a colleague').join(', ')}` : null,
        d.remarks,
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Not planned';

const sameDay = (a: MonthlyPlanEntry | undefined, b: MonthlyPlanEntry | undefined) =>
  !!a && !!b && a.workingType === b.workingType && a.remarks === b.remarks && (a.returnDate ?? null) === (b.returnDate ?? null) &&
  [...a.routeIds].sort().join() === [...b.routeIds].sort().join() && [...a.workWith].sort().join() === [...b.workWith].sort().join();

/** The days one edit changed: each day as it was before and as the edit left it (trip stay/return days follow their first day). */
function changedDays(before: MonthlyPlanEntry[], after: MonthlyPlanEntry[]) {
  const was = new Map(before.filter((d) => !isTripDay(d.dayKind)).map((d) => [d.planDate, d]));
  const now = new Map(after.filter((d) => !isTripDay(d.dayKind)).map((d) => [d.planDate, d]));
  return [...new Set([...was.keys(), ...now.keys()])]
    .filter((date) => !sameDay(was.get(date), now.get(date)))
    .sort()
    .map((date) => ({ date, was: was.get(date), now: now.get(date) }));
}

/**
 * "Edited by your manager" (docs/mobile/monthlyplan.md rule 19, M4): each change a manager or Admin made to a waiting Tour Plan —
 * who, when and why — and, on request, the days it changed as they were before and after.
 */
export function PlanAmendments({ amendments, entries, routes, nameOf, timeZone, editor = 'a manager' }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  if (amendments.length === 0) return null;
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{amendments.length === 1 ? `Edited by ${editor}` : `Edited ${amendments.length} times by ${editor}`}</ThemedText>
      {amendments.map((a, i) => {
        const after = amendments[i + 1]?.previous ?? entries;
        const days = open === i ? changedDays(a.previous, after) : [];
        return (
          <View key={`${a.at}-${i}`} style={styles.item}>
            <ThemedText type="small">{`${nameOf(a.by) ?? 'Your manager or Admin'} · ${formatWhen(a.at, timeZone)}`}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{`Reason: ${a.reason}`}</ThemedText>
            {open === i ? (
              days.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">No day was changed.</ThemedText>
              ) : (
                days.map((d) => (
                  <View key={d.date} style={styles.day}>
                    <ThemedText type="smallBold">{prettyDay(d.date)}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">{`Before: ${dayText(d.was, routes, nameOf)}`}</ThemedText>
                    <ThemedText type="small">{`After: ${dayText(d.now, routes, nameOf)}`}</ThemedText>
                  </View>
                ))
              )
            ) : null}
            <PrimaryButton label={open === i ? 'Hide the changes' : 'See what changed'} variant="text" onPress={() => setOpen(open === i ? null : i)} />
          </View>
        );
      })}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  item: { gap: Spacing.one },
  day: { gap: Spacing.half, paddingLeft: Spacing.two },
});
