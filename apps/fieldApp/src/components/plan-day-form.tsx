import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCachedSource } from '@/offline/cache';
import { isFieldDay, routeTypeLabel, WORKING_TYPES, type NamedRoute, type PlanDay, type WorkingType } from '@/lib/planning';
import type { Colleague } from '@/offline/colleagues';
import type { TerritorySnapshot } from '@/types/sync';

import { addDays, addMonths, datesInMonth, prettyMonth } from '@/offline/day';

import { ChoiceChips } from './choice-chips';
import { DateStepper } from './date-stepper';
import { PrimaryButton } from './primary-button';
import { WorkWithPicker } from './work-with-picker';
import { TextField } from './text-field';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

/** The server refuses remarks longer than this. */
const REMARKS_MAX = 1000;

type Props = {
  value: PlanDay;
  onChange: (next: PlanDay) => void;
  disabled?: boolean;
  /** The day being planned (`YYYY-MM-DD`). Given for a single day, it lets an out-station trip name its return day. */
  date?: string;
  /** What is wrong with the day, by field: marks the Routes list or the return date in red with the message. */
  errors?: { routes?: string; returnDate?: string };
  /** Locked days (weekly off, holidays). A trip can't run over one, so its return date stops the day before the next one. */
  lockedDates?: string[];
  /**
   * Someone else's plan (a manager editing an employee's month): pick from these routes instead of your own cached ones, and
   * from `people` for "Work with". `routesLoaded` is false while they are being fetched.
   */
  forOther?: { routes: NamedRoute[]; routesLoaded: boolean; people: { list: Colleague[]; loaded: boolean; emptyText: string } };
};

/**
 * One planned day of the Monthly Plan: working type, routes, work-with, remarks. Routes come from the cached `territory`
 * pull, so it works offline. "Work with" comes from the colleagues the server offers (offline/colleagues.ts). The routes
 * chosen here decide which doctors can be planned on that day (docs/mobile/monthlyplan.md rule 15).
 */
export function PlanDayForm({ value, onChange, disabled, date, errors, lockedDates, forOther }: Props) {
  const theme = useTheme();
  const territory = useCachedSource<TerritorySnapshot>('territory');
  const routes: { id: string; name: string; routeType: string; detail: string }[] = forOther
    ? forOther.routes.map((r) => ({ ...r, detail: routeTypeLabel(r.routeType) ?? '' }))
    : (territory.data?.routes ?? []).map((r) => ({ ...r, detail: `${r.hqName}${r.distanceKm ? ` · ${r.distanceKm} km` : ''}` }));
  const routesLoaded = forOther ? forOther.routesLoaded : territory.loaded;
  const needsRoute = isFieldDay(value.workingType);
  // A trip needs at least one out-station route; the return day is then asked for.
  const outStation = routes.some((r) => r.routeType === 'OUT_STATION' && value.routeIds.includes(r.id));
  const canTrip = needsRoute && outStation && date !== undefined;
  // The return day: after this day, this month or the next.
  const earliest = date ? addDays(date, 1) : undefined;
  const nextMonthEnd = date ? datesInMonth(addMonths(date.slice(0, 7), 1)).at(-1) : undefined;
  const nextLocked = date ? (lockedDates ?? []).filter((d) => d > date).sort()[0] : undefined;
  const latest = nextLocked && nextMonthEnd ? (addDays(nextLocked, -1) < nextMonthEnd ? addDays(nextLocked, -1) : nextMonthEnd) : nextMonthEnd;
  const tripPossible = earliest !== undefined && latest !== undefined && earliest <= latest;

  function setType(workingType: WorkingType) {
    // Only Field Work and Doctor Campaign take routes (the server refuses them on the other three) and colleagues to work with.
    const field = isFieldDay(workingType);
    onChange({ ...value, workingType, routeIds: field ? value.routeIds : [], workWith: field ? value.workWith : [], returnDate: field ? value.returnDate : null });
  }

  function toggleRoute(id: string) {
    const routeIds = value.routeIds.includes(id)
      ? value.routeIds.filter((r) => r !== id)
      : [...value.routeIds, id];
    // Without an out-station route there is no trip, so the return day goes.
    const stillOut = routes.some((r) => r.routeType === 'OUT_STATION' && routeIds.includes(r.id));
    onChange({ ...value, routeIds, returnDate: stillOut ? value.returnDate : null });
  }

  return (
    <>
      <ThemedText type="smallBold">Working type</ThemedText>
      <ChoiceChips options={WORKING_TYPES} value={value.workingType} onChange={setType} disabled={disabled} />

      {!needsRoute ? (
        <ThemedText type="small" themeColor="textSecondary">
          Routes and “Work with” are only picked for Field Work and Doctor Campaign days.
        </ThemedText>
      ) : null}

      {needsRoute ? (
        <>
          <ThemedText type="smallBold">Routes</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {`Choose carefully: only ${forOther ? 'their' : 'your'} doctors on these routes can be planned that day.${
              value.workingType === 'DOCTOR_CAMPAIGN' ? ' A campaign day pays DA at the highest route type and no TA.' : ''
            }`}
          </ThemedText>
          {routes.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              {!routesLoaded
                ? forOther ? 'Loading their routes…' : 'Loading your routes…'
                : forOther ? 'No routes are assigned to them. Admin assigns routes.' : 'No routes are assigned to you yet. Ask your Admin to assign one.'}
            </ThemedText>
          ) : (
            <View style={errors?.routes ? [styles.marked, { borderColor: theme.danger }] : styles.routeList}>
            {routes.map((r) => {
              const selected = value.routeIds.includes(r.id);
              return (
                <Pressable
                  key={r.id}
                  disabled={disabled}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected, disabled }}
                  onPress={() => toggleRoute(r.id)}>
                  <ThemedView
                    type="backgroundElement"
                    style={[styles.route, selected && { borderColor: theme.primary }, disabled && styles.disabled]}>
                    <ThemedView
                      type={selected ? 'primary' : 'backgroundSelected'}
                      style={styles.box}>
                      <ThemedText type="small" themeColor="onPrimary">
                        {selected ? '✓' : ''}
                      </ThemedText>
                    </ThemedView>
                    <ThemedView type="backgroundElement" style={styles.routeText}>
                      <ThemedText type="smallBold">{r.name}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {r.detail}
                      </ThemedText>
                    </ThemedView>
                  </ThemedView>
                </Pressable>
              );
            })}
            {errors?.routes ? (
              <ThemedText type="small" themeColor="danger">
                {errors.routes}
              </ThemedText>
            ) : null}
            </View>
          )}
        </>
      ) : null}

      {canTrip && earliest && latest ? (
        <ThemedView type="backgroundElement" style={styles.trip}>
          <ThemedText type="smallBold">Out-station trip</ThemedText>
          {value.returnDate ? (
            <>
              <DateStepper
                label="Return date"
                value={value.returnDate}
                min={earliest}
                disabled={disabled}
                onChange={(d) => onChange({ ...value, returnDate: d < earliest ? earliest : d > latest ? latest : d })}
              />
              {errors?.returnDate ? (
                <ThemedText type="small" themeColor="danger">
                  {errors.returnDate}
                </ThemedText>
              ) : null}
              {nextLocked && latest && latest < (nextMonthEnd ?? latest) ? (
                <ThemedText type="small" themeColor="textSecondary">
                  A trip can’t run over a weekly off or a holiday, so the latest return is the day before it.
                </ThemedText>
              ) : null}
              <ThemedText type="small" themeColor="textSecondary">
                The days in between are stay days (out-station DA, no TA). The return day earns TA and ex-station DA. Each is a working day: it needs its own Daily Plan and report.
              </ThemedText>
              {/* The server writes a trip's days in the next month into that month's plan (monthlyplan.md rule 16), which still needs its own submit. */}
              {date && value.returnDate.slice(0, 7) > date.slice(0, 7) ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {`The trip’s days in ${prettyMonth(value.returnDate.slice(0, 7))} are added to that month’s plan when you save. That month still needs to be sent for approval.`}
                </ThemedText>
              ) : null}
              <PrimaryButton label="Same-day return (no trip)" variant="text" disabled={disabled} onPress={() => onChange({ ...value, returnDate: null })} />
            </>
          ) : (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                Leave this empty for a same-day return. If you stay away, add the day you come back.
              </ThemedText>
              {tripPossible ? (
                <PrimaryButton label="+ Add a return date" variant="text" disabled={disabled} onPress={() => onChange({ ...value, returnDate: earliest })} />
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  The next day is a weekly off or a holiday, so a trip can’t start today.
                </ThemedText>
              )}
            </>
          )}
        </ThemedView>
      ) : null}

      {needsRoute ? (
        <WorkWithPicker value={value.workWith} onChange={(workWith) => onChange({ ...value, workWith })} disabled={disabled} people={forOther?.people} />
      ) : null}

      <TextField
        label="Remarks (optional)"
        value={value.remarks ?? ''}
        onChangeText={(t) => onChange({ ...value, remarks: t.length > 0 ? t : null })}
        editable={!disabled}
        maxLength={REMARKS_MAX}
        multiline
      />
    </>
  );
}

const styles = StyleSheet.create({
  route: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  disabled: { opacity: 0.6 },
  routeList: { gap: Spacing.two },
  marked: { gap: Spacing.two, borderWidth: 1.5, borderRadius: Spacing.three, padding: Spacing.two },
  trip: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  box: { width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  routeText: { flex: 1 },
});
