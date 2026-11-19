import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useTheme } from '@/hooks/use-theme';
import { useCachedSource } from '@/offline/cache';
import { isFieldDay, routeTypeLabel, WORKING_TYPES, type NamedRoute, type PlanDay, type TeamRoute, type WorkingType, knownTeamRoute, rememberTeamRoutes } from '@/lib/planning';
import type { TerritorySnapshot } from '@/types/sync';

import { addDays, addMonths, datesInMonth, prettyMonth } from '@/offline/day';

import { ChoiceChips } from './choice-chips';
import { DayPicker } from './day-picker';
import { OutletPicker } from './outlet-picker';
import { PrimaryButton } from './primary-button';
import { TeamRoutesField } from './team-routes-field';
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
  errors?: { routes?: string; returnDate?: string; start?: string };
  /** Locked days (weekly off, holidays). A trip may run over them and come back on one; they stay what they are (decision-log 2026-11-19). */
  lockedDates?: string[];
  /**
   * Someone else's plan (a manager editing an employee's month): pick from these routes instead of your own cached ones.
   * `routesLoaded` is false while they are being fetched.
   */
  forOther?: { routes: NamedRoute[]; routesLoaded: boolean };
  /** Moves the trip's first day ("Leaves on") to another day of the month; the screen puts the trip there. */
  onMoveStart?: ((date: string) => void) | undefined;
};

/**
 * One planned day of the Tour Plan: working type, routes, remarks. There is no "Work with" here any more (2026-11-17): who the day is
 * worked with is chosen on the Daily Plan, after the route. An MR's routes come from the cached `territory` pull, so it works offline; a manager's
 * are the routes held by anyone below them, picked HQ first (`TeamRoutesField`, online). The routes chosen here decide which doctors can be
 * planned on that day (docs/mobile/monthlyplan.md rule 15).
 */
export function PlanDayForm({ value, onChange, disabled, date, errors, lockedDates, forOther, onMoveStart }: Props) {
  const theme = useTheme();
  const { isManager } = useCurrentUser();
  const territory = useCachedSource<TerritorySnapshot>('territory');
  // A manager's own plan: routes of their team (server lookup), remembered here so the chosen ones keep their names and types.
  const teamPick = isManager && !forOther;
  const [teamKnown, setTeamKnown] = useState<TeamRoute[]>(() => value.routeIds.flatMap((id) => knownTeamRoute(id) ?? []));
  const rememberFound = (found: TeamRoute[]) => {
    rememberTeamRoutes(found); // shared, so the screen's trip check and route names can use them too
    setTeamKnown((prev) => [...prev.filter((p) => !found.some((f) => f.id === p.id)), ...found]);
  };
  const routes: { id: string; name: string; routeType: string; detail: string }[] = forOther
    ? forOther.routes.map((r) => ({ ...r, detail: routeTypeLabel(r.routeType) ?? '' }))
    : teamPick
      ? teamKnown.map((r) => ({ id: r.id, name: r.name, routeType: r.routeType, detail: r.hqName }))
      : (territory.data?.routes ?? []).map((r) => ({ ...r, detail: r.hqName }));
  const routesLoaded = forOther ? forOther.routesLoaded : territory.loaded;
  const needsRoute = isFieldDay(value.workingType);
  // A trip needs at least one out-station route; the return day is then asked for.
  const outStation = routes.some((r) => r.routeType === 'OUT_STATION' && value.routeIds.includes(r.id));
  const canTrip = needsRoute && outStation && date !== undefined;
  // The return day: after this day, this month or the next.
  const earliest = date ? addDays(date, 1) : undefined;
  const nextMonthEnd = date ? datesInMonth(addMonths(date.slice(0, 7), 1)).at(-1) : undefined;
  const latest = nextMonthEnd;
  const monthDays = date ? datesInMonth(date.slice(0, 7)) : [];
  // Weekly offs and holidays the trip runs over (or comes back on): they earn nothing and are not stay days.
  const offOnTrip = date && value.returnDate ? (lockedDates ?? []).filter((d) => d > date && d <= value.returnDate!).sort() : [];
  const tripPossible = earliest !== undefined && latest !== undefined && earliest <= latest;

  const chosenTags =
    value.routeIds.length > 0 ? (
                <View style={styles.tags}>
                  {value.routeIds.map((id) => {
                    const r = routes.find((x) => x.id === id);
                    return (
                      <Pressable
                        key={id}
                        disabled={disabled}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${r?.name ?? 'route'}`}
                        onPress={() => setRoutes(value.routeIds.filter((x) => x !== id))}>
                        <ThemedView type="backgroundElement" style={[styles.tag, { borderColor: theme.border }, disabled && styles.disabled]}>
                          <ThemedText type="small">{r?.name ?? 'Route'}</ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">✕</ThemedText>
                        </ThemedView>
                      </Pressable>
                    );
                  })}
                </View>
    ) : null;

  function setType(workingType: WorkingType) {
    // Only Field Work and Doctor Campaign take routes (the server refuses them on the other three).
    const field = isFieldDay(workingType);
    onChange({ ...value, workingType, routeIds: field ? value.routeIds : [], workWith: [], returnDate: field ? value.returnDate : null });
  }

  function setRoutes(routeIds: string[]) {
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
          Routes are only picked for Field Work and Doctor Campaign days. Who you work with is chosen on the day itself.
        </ThemedText>
      ) : null}

      {needsRoute ? (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            {`Choose carefully: only ${forOther ? 'their' : teamPick ? 'your team’s' : 'your'} doctors on these routes can be planned that day.${
              value.workingType === 'DOCTOR_CAMPAIGN' ? ' A campaign day pays DA at the highest route type and no TA.' : ''
            }`}
          </ThemedText>
          {teamPick ? (
            <View style={errors?.routes ? [styles.marked, { borderColor: theme.danger }] : styles.routeList}>
              <TeamRoutesField value={value.routeIds} onChange={setRoutes} disabled={disabled} known={teamKnown} onKnown={rememberFound} />
              {chosenTags}
              {errors?.routes ? (
                <ThemedText type="small" themeColor="danger">
                  {errors.routes}
                </ThemedText>
              ) : null}
            </View>
          ) : routes.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              {!routesLoaded
                ? forOther ? 'Loading their routes…' : 'Loading your routes…'
                : forOther ? 'No routes are assigned to them. Admin assigns routes.' : 'No routes are assigned to you yet. Ask your Admin to assign one.'}
            </ThemedText>
          ) : (
            <View style={errors?.routes ? [styles.marked, { borderColor: theme.danger }] : styles.routeList}>
              {/* One dropdown, several routes: tick the routes in the sheet and tap Done. */}
              <OutletPicker
                label="Routes"
                multiple
                searchable
                values={value.routeIds}
                onChangeValues={setRoutes}
                options={routes.map((r) => ({ id: r.id, name: r.name, subtitle: r.detail }))}
                disabled={disabled}
                emptyText={forOther ? 'No routes are assigned to them.' : 'No routes are assigned to you yet.'}
              />
              {chosenTags}
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
              {onMoveStart && date ? (
                <>
                  <ThemedText type="small" themeColor="textSecondary">Leaves on</ThemedText>
                  <DayPicker value={date} min={monthDays[0]} max={monthDays.at(-1)} onChange={(d) => !disabled && onMoveStart(d)} />
                  {errors?.start ? (
                    <ThemedText type="small" themeColor="danger">
                      {errors.start}
                    </ThemedText>
                  ) : null}
                </>
              ) : null}
              <ThemedText type="small" themeColor="textSecondary">Return date</ThemedText>
              <DayPicker value={value.returnDate} min={earliest} max={latest} onChange={(d) => !disabled && onChange({ ...value, returnDate: d < earliest ? earliest : d > latest ? latest : d })} />
              {errors?.returnDate ? (
                <ThemedText type="small" themeColor="danger">
                  {errors.returnDate}
                </ThemedText>
              ) : null}
              {offOnTrip.length > 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {`${offOnTrip.length === 1 ? 'A weekly off or holiday falls' : `${offOnTrip.length} weekly offs or holidays fall`} inside the trip. ${offOnTrip.length === 1 ? 'It stays' : 'They stay'} as ${offOnTrip.length === 1 ? 'it is' : 'they are'}: no daily plan, report or DA${value.returnDate && offOnTrip.includes(value.returnDate) ? ', and no TA on the return day because you come back on one' : ''}.`}
                </ThemedText>
              ) : null}
              <ThemedText type="small" themeColor="textSecondary">
                The days in between are stay days (out-station DA, no TA). The return day earns TA and ex-station DA. Each is a working day: it needs its own Daily Plan and report. A weekly off or holiday inside the trip earns nothing.
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
              ) : null}
            </>
          )}
        </ThemedView>
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
  disabled: { opacity: 0.6 },
  routeList: { gap: Spacing.two },
  marked: { gap: Spacing.two, borderWidth: 1.5, borderRadius: Spacing.three, padding: Spacing.two },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tag: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + 2 },
  trip: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
});
