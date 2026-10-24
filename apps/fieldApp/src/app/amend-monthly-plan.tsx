import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Notice } from '@/components/notice';
import { PlanAmendments } from '@/components/plan-amendments';
import { PlanCalendar } from '@/components/plan-calendar';
import { PlanDayCard } from '@/components/plan-day-card';
import { PlanDayForm } from '@/components/plan-day-form';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useDayGate } from '@/hooks/use-day-gate';
import {
  EMPTY_DAY,
  amendErrorText,
  clearPlanDay,
  placePlanDay,
  amendMonthlyPlan,
  errorDate,
  getMonthlyPlanById,
  isAmendStale,
  isFieldDay,
  isTripDay,
  listPlanOwnerRoutes,
  offDayLabel,
  workingTypeLabel,
  type MonthlyPlanEntry,
  type MonthlyPlanView,
  type NamedRoute,
  type PlanDay,
} from '@/lib/planning';
import { useSessionUser } from '@/lib/session';
import { useOnline } from '@/offline';
import { useCachedSource } from '@/offline/cache';
import { useColleagues, type Colleague } from '@/offline/colleagues';
import { addMonths, datesInMonth, prettyDay, prettyMonth } from '@/offline/day';
import type { ConfigSnapshot } from '@/types/sync';

type Entries = Record<string, PlanDay>;
type Loaded = { plan: MonthlyPlanView & { routes: NamedRoute[] }; ownerRoutes: NamedRoute[] };

/** The server refuses a longer reason. */
const REASON_MAX = 500;

const toEntries = (list: MonthlyPlanEntry[]): Entries =>
  Object.fromEntries(
    list.map((e) => [
      e.planDate,
      { workingType: e.workingType, workWith: e.workWith, routeIds: e.routeIds, remarks: e.remarks, returnDate: e.returnDate ?? null, dayKind: e.dayKind ?? 'NORMAL' },
    ]),
  );
const sameDay = (a: PlanDay | undefined, b: PlanDay | undefined) =>
  !!a && !!b && a.workingType === b.workingType && a.remarks === b.remarks && (a.returnDate ?? null) === (b.returnDate ?? null) &&
  [...a.routeIds].sort().join() === [...b.routeIds].sort().join() && [...a.workWith].sort().join() === [...b.workWith].sort().join();

/**
 * Edit an employee's Tour Plan while it waits for you (docs/mobile/monthlyplan.md rule 19, section 6): a manager above them, or
 * Admin. Every day can be changed — working type, the employee's own routes (`GET /planning/monthly/:id/routes`), work with,
 * remarks and trips; weekly offs and holidays stay locked. The whole month goes to the server with an optional reason; the plan
 * keeps waiting for your decision and the employee is told. Online only.
 */
export default function AmendMonthlyPlanScreen() {
  const { id, who } = useLocalSearchParams<{ id: string; who?: string }>();
  const online = useOnline();
  const me = useSessionUser();
  const { today } = useDayGate();
  const config = useCachedSource<ConfigSnapshot>('config');
  const { colleagues, loaded: colleaguesLoaded } = useColleagues();
  const timeZone = config.data?.settings.BUSINESS_TIMEZONE;

  const [data, setData] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entries>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [sheet, setSheet] = useState<PlanDay>(EMPTY_DAY);
  const [sheetErrors, setSheetErrors] = useState<{ routes?: string; returnDate?: string }>({});
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string>();
  const [msg, setMsg] = useState<{ tone: 'danger' | 'warning' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return null;
    const [plan, ownerRoutes] = await Promise.all([getMonthlyPlanById(id), listPlanOwnerRoutes(id)]);
    return { plan, ownerRoutes };
  }, [id]);

  // Loaded once: coming back online after a blip must not throw away the days being edited (a stale save reloads on its own).
  const loaded = data !== null;
  useEffect(() => {
    if (!online || loaded) return;
    let alive = true;
    load()
      .then((r) => {
        if (!alive || !r) return;
        setData(r);
        setEntries(toEntries(r.plan.entries));
        setLoadError(null);
      })
      .catch((err) => alive && setLoadError(amendErrorText(err)));
    return () => {
      alive = false;
    };
  }, [load, online, loaded]);

  const plan = data?.plan ?? null;
  const month = plan?.planMonth ?? '';
  const days = useMemo(() => (month ? datesInMonth(month) : []), [month]);
  const offByDate = useMemo(() => new Map((plan?.offDays ?? []).map((d) => [d.date, d])), [plan]);
  const isOff = (d: string) => offByDate.has(d);
  const offLabelOf = (d: string) => { const o = offByDate.get(d); return o ? offDayLabel(o) : 'Weekly off'; };
  const lockedDates = useMemo(() => [...offByDate.keys()], [offByDate]);

  // The employee's routes, plus any route already on the plan that isn't in that list (a manager's plan may use their team's).
  const routes = useMemo(() => {
    if (!data) return [];
    const byId = new Map(data.ownerRoutes.map((r) => [r.id, r]));
    const used = new Set(data.plan.entries.flatMap((e) => e.routeIds));
    for (const r of data.plan.routes) if (used.has(r.id) && !byId.has(r.id)) byId.set(r.id, r);
    return [...byId.values()];
  }, [data]);

  // Work with: anyone active the server offers, never the plan's owner (refused), and the manager themselves (left out of their own list).
  const people = useMemo(() => {
    const list = colleagues.filter((c) => c.id !== plan?.userId);
    if (me && me.id !== plan?.userId && !list.some((c) => c.id === me.id)) {
      const self: Colleague = { id: me.id, employeeCode: me.employeeCode, name: me.name, designation: null, label: `${me.name} (you)`, relation: 'MANAGER' };
      list.unshift(self);
    }
    return list;
  }, [colleagues, plan?.userId, me]);

  const names = useMemo(
    () => ({ routes: new Map(routes.map((r) => [r.id, r.name])), colleagues: new Map(people.map((c) => [c.id, c])) }),
    [routes, people],
  );
  const nameOf = (userId: string) => (userId === me?.id ? 'You' : (colleagues.find((c) => c.id === userId)?.name ?? null));

  const original = useMemo(() => (plan ? toEntries(plan.entries) : {}), [plan]);
  const changed = [...new Set([...Object.keys(original), ...Object.keys(entries)])]
    .filter((d) => !isTripDay(original[d]?.dayKind) && !isTripDay(entries[d]?.dayKind) && !sameDay(original[d], entries[d]))
    .sort();
  const waiting = plan?.status === 'SUBMITTED';

  // A stay or return day belongs to the trip on an earlier day: it is changed from that first day. `null` start: the trip began in
  // the month before, so it is changed from that month's plan.
  const tripDay = editing !== null && isTripDay(entries[editing]?.dayKind);
  const tripStart = tripDay
    ? (Object.keys(entries).filter((d) => d < editing && entries[d]?.returnDate && entries[d]!.returnDate! >= editing).sort().at(-1) ?? null)
    : null;

  function openDay(date: string) {
    setSheet(entries[date] ?? EMPTY_DAY);
    setSheetErrors({});
    setEditing(date);
  }

  /** The same checks the employee's own Tour Plan makes before a day is accepted; the server checks again. */
  function validDay(day: PlanDay, date: string): { field: 'routes' | 'returnDate'; text: string } | null {
    if (isFieldDay(day.workingType) && day.routeIds.length === 0) return { field: 'routes', text: `Pick at least one route for a ${workingTypeLabel(day.workingType)} day.` };
    if (day.returnDate) {
      if (!routes.some((r) => r.routeType === 'OUT_STATION' && day.routeIds.includes(r.id))) return { field: 'routes', text: 'A trip needs at least one out-station route. Add one, or clear the return date.' };
      if (day.returnDate <= date) return { field: 'returnDate', text: 'The return date must be after the day they leave.' };
      if (day.returnDate.slice(0, 7) > addMonths(date.slice(0, 7), 1)) return { field: 'returnDate', text: 'A trip can’t return later than next month.' };
      // Only this trip's own stay and return days may be run over (they move with it); any other planned day, or another trip's day, may not.
      const ownEnd = entries[date]?.returnDate ?? null;
      const clash = Object.keys(entries).find((d) => d > date && d <= day.returnDate! && !(isTripDay(entries[d]?.dayKind) && ownEnd !== null && d <= ownEnd) && !offByDate.has(d));
      if (clash) return { field: 'returnDate', text: `${prettyDay(clash)} is already planned. Clear it, or choose an earlier return date.` };
      const locked = lockedDates.filter((d) => d > date && d <= day.returnDate!).sort()[0];
      if (locked) return { field: 'returnDate', text: `${prettyDay(locked)} is ${offLabelOf(locked).toLowerCase()}, so a trip can’t run over it. Choose an earlier return date.` };
    }
    return null;
  }

  /** Puts the day in the month. A trip's old stay and return days go and its new ones come in; the server rebuilds them on save. */
  function applySheet() {
    if (!editing) return;
    const problem = validDay(sheet, editing);
    if (problem) {
      setSheetErrors({ [problem.field]: problem.text });
      return;
    }
    const date = editing;
    setEntries((e) => placePlanDay(e, month, date, sheet)); // the trip's stay and return days come with it, as the server writes them
    setMsg(null);
    setEditing(null);
  }

  function clearDay() {
    if (!editing) return;
    const date = editing;
    setEntries((e) => clearPlanDay(e, date));
    setMsg(null);
    setEditing(null);
  }

  const list = (): MonthlyPlanEntry[] =>
    Object.entries(entries)
      .filter(([d]) => !offByDate.has(d))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([planDate, d]) => ({ planDate, ...d }));

  async function save() {
    if (!id || !plan) return;
    if (!online) {
      setMsg({ tone: 'warning', text: 'Saving the changes needs the internet. Your edits stay on this screen.' });
      return;
    }
    if (changed.length === 0) {
      setMsg({ tone: 'info', text: 'Change at least one day first.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    const sent = list();
    try {
      await amendMonthlyPlan(id, sent, reason);
      Alert.alert('Plan updated', `${who || 'The employee'} has been told. The plan still waits for your approval.`, [{ text: 'OK', onPress: () => router.back() }]);
    } catch (err) {
      if (isAmendStale(err)) {
        // Someone else saved the plan meanwhile: show it as it now stands; the reason is kept.
        const fresh = await load().catch(() => null);
        if (fresh) {
          setData(fresh);
          setEntries(toEntries(fresh.plan.entries));
        }
      }
      const date = errorDate(err, sent);
      setMsg({ tone: 'danger', text: date ? `${prettyDay(date)}: ${amendErrorText(err)}` : amendErrorText(err) });
    } finally {
      setBusy(false);
    }
  }

  // The save's outcome sits beside the button, so it is seen wherever the month is scrolled to.
  const footer =
    plan && waiting ? (
      <View style={styles.footer}>
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <PrimaryButton
          label={changed.length > 0 ? `Save changes (${changed.length} day${changed.length === 1 ? '' : 's'})` : 'Save changes'}
          loading={busy}
          disabled={!online}
          onPress={save}
        />
      </View>
    ) : null;

  return (
    <ScreenShell title="Edit Tour Plan" subtitle={[who, month ? prettyMonth(month) : null].filter(Boolean).join(' · ')} wide footer={footer}>
      {!online ? <Notice tone="warning">You’re offline. Editing a plan needs the internet.</Notice> : null}
      {loadError ? <Notice tone="danger">{loadError}</Notice> : null}

      {!plan ? (
        online && !loadError ? <Skeleton cards={3} /> : null
      ) : (
        <>
          {!waiting ? (
            <Notice tone="warning">
              {plan.status === 'MANAGER_APPROVED' || plan.status === 'APPROVED'
                ? 'This plan is already approved, so it can’t be edited here. Ask Admin to reopen it.'
                : 'This plan isn’t waiting for approval, so the employee edits it.'}
            </Notice>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              Tap a day to change it. Weekly offs and holidays can’t be planned. When you save, the employee is told and the plan still
              waits for your approval.
            </ThemedText>
          )}

          {plan.amendments && plan.amendments.length > 0 ? (
            <PlanAmendments amendments={plan.amendments} entries={plan.entries} routes={plan.routes} nameOf={nameOf} timeZone={timeZone} />
          ) : null}

          <PlanCalendar month={month} days={days} entries={entries} isOff={isOff} today={today} onPressDay={waiting ? openDay : undefined} />

          {changed.length > 0 ? (
            <Notice tone="info" title="Changed, not saved yet">
              {changed.map((d) => prettyDay(d)).join(', ')}
            </Notice>
          ) : null}

          <View style={styles.days}>
            {days.map((d) => (
              <PlanDayCard key={d} date={d} entry={entries[d]} off={isOff(d)} offLabel={offLabelOf(d)} editable={waiting} names={names} onPress={() => openDay(d)} />
            ))}
          </View>

          {waiting ? (
            <TextField
              label="Reason for the change (optional)"
              placeholder="The employee sees this"
              value={reason}
              onChangeText={(t) => {
                setReason(t);
                setReasonError(undefined);
                setMsg(null);
              }}
              maxLength={REASON_MAX}
              multiline
              error={reasonError}
            />
          ) : null}
        </>
      )}

      <Modal visible={editing !== null} animationType="slide" onRequestClose={() => setEditing(null)}>
        <ThemedView style={styles.flex}>
          <SafeAreaView style={styles.flex}>
            <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
              <ThemedText type="subtitle" style={styles.sheetTitle}>
                {editing ? prettyDay(editing) : ''}
              </ThemedText>
              {editing && tripDay ? (
                <>
                  <Notice tone="info" title={entries[editing]?.dayKind === 'TRANSIT' ? 'Return day of a trip' : 'Stay day of a trip'}>
                    {`${
                      tripStart
                        ? `This day is part of the trip that starts on ${prettyDay(tripStart)}. To change it, edit that first day.`
                        : 'This day is part of a trip that starts in the month before. It is changed from that month’s plan.'
                    }\n\n${entries[editing]?.dayKind === 'TRANSIT' ? 'TA · ex-station DA' : 'No TA · out-station DA only'}`}
                  </Notice>
                  {tripStart ? <PrimaryButton label="Open the first day" onPress={() => openDay(tripStart)} /> : null}
                </>
              ) : editing ? (
                <>
                  <PlanDayForm
                    value={sheet}
                    onChange={(next) => {
                      setSheet(next);
                      setSheetErrors({});
                    }}
                    errors={sheetErrors}
                    date={editing}
                    lockedDates={lockedDates}
                    forOther={{
                      routes,
                      routesLoaded: data !== null,
                      people: { list: people, loaded: colleaguesLoaded, emptyText: 'No colleagues to show. Connect to the internet so the list can load.' },
                    }}
                  />
                  <PrimaryButton label="Done" onPress={applySheet} />
                  {entries[editing] ? <PrimaryButton label="Clear this day" variant="text" onPress={clearDay} /> : null}
                </>
              ) : null}
              <PrimaryButton label="Cancel" variant="text" onPress={() => setEditing(null)} />
            </ScrollView>
          </SafeAreaView>
        </ThemedView>
      </Modal>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  days: { gap: Spacing.two },
  footer: { gap: Spacing.two },
  sheet: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  sheetTitle: { fontSize: 28, lineHeight: 34 },
});
