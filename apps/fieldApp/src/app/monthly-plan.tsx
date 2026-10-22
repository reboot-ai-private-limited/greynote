import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChoiceChips } from '@/components/choice-chips';
import { Notice } from '@/components/notice';
import { PillToggle } from '@/components/pill-toggle';
import { PlanApprovalSteps } from '@/components/plan-approval-steps';
import { PlanCalendar } from '@/components/plan-calendar';
import { PlanDayCard } from '@/components/plan-day-card';
import { PlanDayForm } from '@/components/plan-day-form';
import { PlanStatusBanner } from '@/components/plan-status-banner';
import { PlanSummaryCard, type PlanCounts } from '@/components/plan-summary-card';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useDayGate } from '@/hooks/use-day-gate';
import { useResponsive } from '@/hooks/use-responsive';
import { useTheme } from '@/hooks/use-theme';
import {
  EDITABLE,
  EMPTY_DAY,
  LATE_TEXT,
  getMonthlyPlanDetail,
  getRejectionReason,
  isFieldDay,
  isTripDay,
  offDayLabel,
  planErrorText,
  saveMonthlyPlan,
  submitMonthlyPlan,
  withdrawPlan,
  workingTypeLabel,
  type MonthlyPlanDetail,
  type PlanDay,
  type WorkingType,
} from '@/lib/planning';
import { refreshNow, useColleagues, useOnline } from '@/offline';
import { useCachedSource } from '@/offline/cache';
import {
  addMonths,
  formatWhen,
  datesInMonth,
  monthOf,
  nowMs,
  prettyDay,
  prettyMonth,
  weekdayOf,
  weeklyOffIndex,
} from '@/offline/day';
import { clearLocalDraft, loadLocalDraft, saveLocalDraft } from '@/offline/local-draft';
import type { ConfigSnapshot, PlanOffDay, PlanningSnapshot, TerritorySnapshot } from '@/types/sync';

type Msg = { tone: 'info' | 'warning' | 'danger' | 'success'; text: string };
type Entries = Record<string, PlanDay>;
/** The day being edited in the sheet; `ALL` fills every working day at once. */
type Editing = { date: string } | 'ALL' | null;
/** Which days the day-wise list shows. */
type Filter = 'ALL' | WorkingType | 'OFF' | 'UNPLANNED';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'FIELD_WORK', label: 'Field Work' },
  { value: 'DOCTOR_CAMPAIGN', label: 'Campaign' },
  { value: 'MEETING', label: 'Meeting' },
  { value: 'CONFERENCE', label: 'Conference' },
  { value: 'STRIKE', label: 'Strike' },
  { value: 'UNPLANNED', label: 'Not planned' },
  { value: 'OFF', label: 'Off' },
];

const errorText = planErrorText;

/**
 * Monthly Plan (PRD §6.2.A): next month day by day, sent as one unit for the manager's approval.
 * Save and Submit need a connection (LLD/planning.md); offline, the form is kept on the phone.
 * The weekly off day is left blank — it isn't a working day.
 */
export default function MonthlyPlanScreen() {
  const planning = useCachedSource<PlanningSnapshot>('planning');
  const config = useCachedSource<ConfigSnapshot>('config');
  const territory = useCachedSource<TerritorySnapshot>('territory');
  const { today } = useDayGate();
  const online = useOnline();
  const { colleagues } = useColleagues();
  const theme = useTheme();
  const { isTablet } = useResponsive();
  const [filter, setFilter] = useState<Filter>('ALL');

  const thisMonth = monthOf(today);
  // Opens on next month, the one planned ahead; the "isn't approved" links pass `month=current` for the month being worked now.
  const { month: startAt } = useLocalSearchParams<{ month?: string }>();
  const [month, setMonth] = useState(startAt === 'current' ? thisMonth : addMonths(thisMonth, 1));
  const [entries, setEntries] = useState<Entries>({});
  const [editing, setEditing] = useState<Editing>(null);
  const [sheet, setSheet] = useState<PlanDay>(EMPTY_DAY);
  const [sheetErrors, setSheetErrors] = useState<{ routes?: string; returnDate?: string }>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  // What the server said, kept with the plan it belongs to: another month or plan reads as "not loaded yet".
  const [rejectionState, setRejectionState] = useState<{ key: string; text: string | null } | null>(null);
  const [detailState, setDetailState] = useState<{ key: string; detail: MonthlyPlanDetail | null } | null>(null);

  const existing = planning.data?.monthlyPlans.find((p) => p.planMonth === month) ?? null;
  const status = existing?.status ?? null;
  const editable = EDITABLE.includes(status);
  const days = useMemo(() => datesInMonth(month), [month]);
  const names = useMemo(
    () => ({
      routes: new Map((territory.data?.routes ?? []).map((r) => [r.id, r.name])),
      colleagues: new Map(colleagues.map((c) => [c.id, c])),
    }),
    [territory.data, colleagues],
  );
  const timeZone = config.data?.settings.BUSINESS_TIMEZONE;

  /** Everything the server knows about this month's plan (online only). */
  const detailKey = `${month}:${existing?.id ?? 'new'}:${status}`;
  const detail = detailState?.key === detailKey ? detailState.detail : null;

  // The locked days (rule 18): the sync snapshot's list covers this and next month; the server's own list for this month, when
  // we have it, is newer and replaces that month's. An older server sends neither, so only the weekly off day is locked then.
  const planOffDays = planning.data?.planOffDays;
  const serverOffDays = detail?.offDays;
  const offByDate = useMemo(() => {
    const map = new Map<string, PlanOffDay>();
    for (const d of planOffDays ?? []) if (!serverOffDays || d.date.slice(0, 7) !== month) map.set(d.date, d);
    for (const d of serverOffDays ?? []) map.set(d.date, d);
    return map;
  }, [planOffDays, serverOffDays, month]);
  const weeklyOff = weeklyOffIndex(config.data?.settings.WEEKLY_OFF_DAY);
  const legacyOff = planOffDays === undefined && serverOffDays === undefined;
  const isOff = (d: string) => offByDate.has(d) || (legacyOff && weeklyOff !== null && weekdayOf(d) === weeklyOff);
  const offLabelOf = (d: string) => { const o = offByDate.get(d); return o ? offDayLabel(o) : 'Weekly off'; };
  const lockedDates = useMemo(() => [...offByDate.keys()], [offByDate]);
  // Days already planned that are now locked (HR added a holiday after the plan was saved): left out of the next save and submit.
  const lockedPlanned = editable ? Object.keys(entries).filter((d) => offByDate.has(d)).sort() : [];
  const rejectionKey = status === 'REJECTED' ? (existing?.approvalRequestId ?? null) : null;
  const rejection = rejectionKey !== null && rejectionState?.key === rejectionKey ? rejectionState.text : null;

  /** Asks the server for the full plan; `null` offline or on a failure. */
  const fetchDetail = useCallback(async () => {
    if (!online) return null;
    try {
      return { key: detailKey, detail: await getMonthlyPlanDetail(month) };
    } catch {
      return null; // Keep what the phone has; the synced plan is enough to work from.
    }
  }, [month, online, detailKey]);
  const loadDetail = () => fetchDetail().then((r) => { if (r) setDetailState(r); });

  useEffect(() => {
    let alive = true;
    void fetchDetail().then((r) => {
      if (alive && r) setDetailState(r);
    });
    return () => {
      alive = false;
    };
  }, [fetchDetail]);

  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!planning.loaded) return;
    const key = `${month}:${existing?.id ?? 'new'}`;
    if (loadedFor.current === key) return;
    loadedFor.current = key;
    setMsg(null);
    void loadLocalDraft<Entries>(`monthly:${month}`).then((local) => {
      if (local && editable) setEntries(local);
      else if (existing) {
        setEntries(
          Object.fromEntries(
            existing.entries.map((e) => [
              e.planDate,
              { workingType: e.workingType, workWith: e.workWith, routeIds: e.routeIds, remarks: e.remarks, returnDate: e.returnDate ?? null, dayKind: e.dayKind ?? 'NORMAL' },
            ]),
          ),
        );
      } else setEntries({});
    });
  }, [planning.loaded, month, existing, editable]);

  useEffect(() => {
    if (rejectionKey && online) {
      getRejectionReason(rejectionKey).then((text) => setRejectionState({ key: rejectionKey, text })).catch(() => undefined);
    }
  }, [rejectionKey, online]);

  // The server's deadline only — never worked out on the phone (it ends with the business day, which follows DAY_START_TIME).
  // Before the first save there is none to show; the server still judges the submit.
  const deadlineIso = detail?.submitDeadline ?? existing?.submitDeadline ?? null;
  const deadlinePassed = deadlineIso !== null && nowMs() > Date.parse(deadlineIso);
  const resubmitUntil = detail?.resubmitAllowedUntil ?? null;
  const lateUntil = detail?.lateSubmitAllowedUntil ?? null;
  const lateButAllowed = editable && deadlinePassed && (resubmitUntil !== null || lateUntil !== null);
  const lateAndRefused = editable && deadlinePassed && !lateButAllowed;
  const planned = Object.keys(entries).filter((d) => !offByDate.has(d)).length;

  // A stay or return day belongs to the trip on an earlier day: it can't be edited on its own.
  const tripOf =
    editing && editing !== 'ALL' && isTripDay(entries[editing.date]?.dayKind)
      ? {
          date: editing.date,
          start:
            Object.keys(entries)
              .filter((d) => d < editing.date && entries[d]?.returnDate && entries[d]!.returnDate! >= editing.date)
              .sort()
              .at(-1) ?? editing.date,
        }
      : null;

  function openDay(date: string) {
    setSheet(entries[date] ?? EMPTY_DAY);
    setSheetErrors({});
    setEditing({ date });
  }

  /** What is wrong with the day being edited, and which field it belongs to (null when it is fine). */
  function validDay(day: PlanDay, date?: string): { field: 'routes' | 'returnDate'; text: string } | null {
    if (isFieldDay(day.workingType) && day.routeIds.length === 0) return { field: 'routes', text: `Pick at least one route for a ${workingTypeLabel(day.workingType)} day.` };
    if (day.returnDate && date) {
      const hasOut = (territory.data?.routes ?? []).some((r) => r.routeType === 'OUT_STATION' && day.routeIds.includes(r.id));
      if (!hasOut) return { field: 'routes', text: 'A trip needs at least one out-station route. Add one, or clear the return date.' };
      if (day.returnDate <= date) return { field: 'returnDate', text: 'The return date must be after the day you leave.' };
      if (day.returnDate.slice(0, 7) > addMonths(date.slice(0, 7), 1)) return { field: 'returnDate', text: 'A trip can’t return later than next month.' };
      // A trip can't run over another planned day of this month.
      const clash = Object.keys(entries).find((d) => d > date && d <= day.returnDate! && !isTripDay(entries[d]?.dayKind) && !offByDate.has(d));
      if (clash) return { field: 'returnDate', text: `${prettyDay(clash)} is already planned. Clear it, or choose an earlier return date.` };
      // A trip can't run over a weekly off or a holiday (stay and return days are planned days).
      const locked = lockedDates.filter((d) => d > date && d <= day.returnDate!).sort()[0];
      if (locked) return { field: 'returnDate', text: `${prettyDay(locked)} is ${offLabelOf(locked).toLowerCase()}, so a trip can’t run over it. Choose an earlier return date.` };
    }
    return null;
  }

  function applySheet() {
    const p = validDay(sheet, editing && editing !== 'ALL' ? editing.date : undefined);
    if (p) {
      setSheetErrors({ [p.field]: p.text });
      return;
    }
    setSheetErrors({});
    if (editing === 'ALL') {
      // One plan for every working day: no trips (a trip is planned from its first day), and a trip already planned stays as it is.
      const plain: PlanDay = { ...sheet, returnDate: null, dayKind: 'NORMAL' };
      setEntries((e) => ({ ...Object.fromEntries(days.filter((d) => !isOff(d) && !isTripDay(e[d]?.dayKind) && !e[d]?.returnDate).map((d) => [d, plain])), ...Object.fromEntries(Object.entries(e).filter(([, v]) => isTripDay(v.dayKind) || v.returnDate)) }));
    } else if (editing) {
      setEntries((e) => ({ ...e, [editing.date]: { ...sheet, dayKind: 'NORMAL' } }));
    }
    setEditing(null);
  }

  function clearDay() {
    if (editing && editing !== 'ALL') {
      const { date } = editing;
      setEntries((e) => {
        const next = { ...e };
        delete next[date];
        return next;
      });
    }
    setEditing(null);
  }

  const list = () => Object.entries(entries).filter(([d]) => !offByDate.has(d)).sort(([a], [b]) => a.localeCompare(b)).map(([planDate, d]) => ({ planDate, ...d }));

  async function run(action: () => Promise<Msg | null>) {
    setBusy(true);
    setMsg(null);
    try {
      const result = await action();
      if (result) setMsg(result);
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  const saveDraft = () =>
    run(async () => {
      if (!online) {
        await saveLocalDraft(`monthly:${month}`, entries);
        return { tone: 'info', text: 'Saved on this phone. Connect to the internet to submit it.' };
      }
      await saveMonthlyPlan(month, list());
      await clearLocalDraft(`monthly:${month}`);
      // The server may have written trip days (and some into next month): read the month again as it now stands.
      loadedFor.current = null;
      await Promise.all([refreshNow(), loadDetail()]);
      return { tone: 'success', text: 'Draft saved.' };
    });

  const submit = () => {
    if (!online) {
      Alert.alert('No connection', 'Submitting a plan needs the internet. Your form is kept — try again when you’re back online.');
      void saveLocalDraft(`monthly:${month}`, entries);
      return;
    }
    return run(async () => {
      if (planned === 0) return { tone: 'warning', text: 'Plan at least one day first.' };
      const saved = await saveMonthlyPlan(month, list());
      await submitMonthlyPlan(saved.id);
      await clearLocalDraft(`monthly:${month}`);
      await Promise.all([refreshNow(), loadDetail()]);
      Alert.alert('Plan submitted', 'Your manager will be asked to approve it.', [{ text: 'OK', onPress: () => router.back() }]);
      return null;
    });
  };

  const withdraw = () =>
    run(async () => {
      if (!existing?.approvalRequestId) return null;
      if (!online) return { tone: 'warning', text: 'Connect to the internet to withdraw.' };
      await withdrawPlan(existing.approvalRequestId);
      await Promise.all([refreshNow(), loadDetail()]);
      return { tone: 'info', text: 'Plan withdrawn. You can edit it and submit again.' };
    });

  const monthOptions = [thisMonth, addMonths(thisMonth, 1)].map((m, i) => ({
    value: m,
    label: i === 0 ? 'This month' : 'Next month',
  }));

  // Counts for the summary card: only days that are not the weekly off.
  const counts: PlanCounts = {
    workingDays: days.filter((d) => !isOff(d)).length,
    planned: days.filter((d) => !isOff(d) && entries[d]).length,
    field: days.filter((d) => isFieldDay(entries[d]?.workingType) && !isOff(d)).length,
    meetings: days.filter((d) => entries[d]?.workingType === 'MEETING' && !isOff(d)).length,
    others: days.filter((d) => (entries[d]?.workingType === 'CONFERENCE' || entries[d]?.workingType === 'STRIKE') && !isOff(d)).length,
  };
  const shownDays = days.filter((d) => {
    if (filter === 'ALL') return true;
    if (filter === 'OFF') return isOff(d);
    if (filter === 'UNPLANNED') return !isOff(d) && !entries[d];
    return !isOff(d) && entries[d]?.workingType === filter;
  });
  const daysLeft =
    editable && !deadlinePassed && deadlineIso ? Math.max(0, Math.ceil((Date.parse(deadlineIso) - nowMs()) / 86_400_000)) : null;

  const footer = editable ? (
    <View style={styles.footer}>
      <Pressable
        disabled={busy}
        accessibilityRole="button"
        onPress={() => { setSheet(EMPTY_DAY); setSheetErrors({}); setEditing('ALL'); }}
        style={[styles.footerButton, styles.outlined, { borderColor: theme.primary }, busy && styles.dim]}>
        <ThemedText type="smallBold" themeColor="primary" numberOfLines={2} style={styles.footerLabel}>
          {isTablet ? 'Fill every working day' : 'Fill all days'}
        </ThemedText>
      </Pressable>
      <Pressable
        disabled={busy}
        accessibilityRole="button"
        onPress={saveDraft}
        style={[styles.footerButton, styles.outlined, { borderColor: theme.border }, busy && styles.dim]}>
        <ThemedText type="smallBold" numberOfLines={1} style={styles.footerLabel}>
          Save draft
        </ThemedText>
      </Pressable>
      <Pressable
        disabled={busy || lateAndRefused}
        accessibilityRole="button"
        onPress={submit}
        style={[styles.footerButton, styles.submit, { backgroundColor: theme.primary }, (busy || lateAndRefused) && styles.dim]}>
        {busy ? (
          <ActivityIndicator color={theme.onPrimary} />
        ) : (
          <ThemedText type="smallBold" themeColor="onPrimary" numberOfLines={1} style={styles.footerLabel}>
            {status === 'REJECTED' ? 'Resubmit plan' : 'Submit plan'}
          </ThemedText>
        )}
      </Pressable>
    </View>
  ) : status === 'SUBMITTED' ? (
    <PrimaryButton label="Withdraw plan" variant="text" loading={busy} onPress={withdraw} />
  ) : null;

  const calendar = (
    <PlanCalendar month={month} days={days} entries={entries} isOff={isOff} today={today} onPressDay={editable ? openDay : undefined} />
  );
  const summary = <PlanSummaryCard counts={counts} />;
  const approval = <PlanApprovalSteps status={status} rejection={rejection} approval={detail?.approval ?? null} timeZone={timeZone} />;
  const dayWise = (
    <View style={styles.dayWise}>
      <View style={styles.dayWiseHead}>
        <ThemedText type="smallBold" style={styles.sectionTitle}>
          Day-wise plan
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {shownDays.length} day{shownDays.length === 1 ? '' : 's'}
        </ThemedText>
      </View>
      <ChoiceChips options={FILTERS} value={filter} onChange={setFilter} />
      {shownDays.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          No days match this filter.
        </ThemedText>
      ) : (
        shownDays.map((d) => (
          <PlanDayCard key={d} date={d} entry={entries[d]} off={isOff(d)} offLabel={offLabelOf(d)} editable={editable} names={names} onPress={() => openDay(d)} />
        ))
      )}
    </View>
  );

  return (
    <ScreenShell title="Tour Plan" subtitle={`Your plan · ${prettyMonth(month)}`} wide footer={footer}>
      <View style={isTablet && styles.toggleWide}>
        <PillToggle options={monthOptions} value={month} onChange={setMonth} />
      </View>

      <PlanStatusBanner
        status={status}
        rejection={rejection}
        deadlineText={editable && !deadlinePassed && deadlineIso ? `Submit by ${formatWhen(deadlineIso, timeZone)}` : null}
        daysLeft={daysLeft}
      />
      {lateAndRefused ? (
        <Notice tone="warning" title="Deadline passed">
          {deadlineIso ? `${LATE_TEXT} (It was due by ${formatWhen(deadlineIso, timeZone)}.)` : LATE_TEXT}
        </Notice>
      ) : null}
      {editable && resubmitUntil ? (
        <Notice tone="warning" title="You can still resubmit">
          {`You can still resubmit until ${formatWhen(resubmitUntil, timeZone)}.`}
        </Notice>
      ) : null}
      {editable && !resubmitUntil && lateUntil ? (
        <Notice tone="warning" title="Late-submission exception">
          {`Admin allowed a late submission until ${formatWhen(lateUntil, timeZone)}.`}
        </Notice>
      ) : null}
      {lockedPlanned.length > 0 ? (
        <Notice tone="warning" title="Locked days left out">
          {`${lockedPlanned.map((d) => `${prettyDay(d)} (${offLabelOf(d)})`).join(', ')} can’t be planned, so ${lockedPlanned.length === 1 ? 'it is' : 'they are'} left out when you save or submit.`}
        </Notice>
      ) : null}
      {editable ? (
        <ThemedText type="small" themeColor="textSecondary">
          The routes you plan for a day decide which doctors you can pick on that day’s Daily Plan.
        </ThemedText>
      ) : null}
      {!online ? <Notice tone="info">You’re offline. You can plan the days and save them on this phone; submitting needs the internet.</Notice> : null}

      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

      {isTablet ? (
        // Tablet: the month's overview on the left, the day-by-day list beside it.
        <View style={styles.columns}>
          <View style={styles.side}>
            {calendar}
            {summary}
            {approval}
          </View>
          <View style={styles.main}>{dayWise}</View>
        </View>
      ) : (
        <>
          {calendar}
          {summary}
          {dayWise}
          {approval}
        </>
      )}

      <Modal visible={editing !== null} animationType="slide" onRequestClose={() => setEditing(null)}>
        <ThemedView style={styles.flex}>
          <SafeAreaView style={styles.flex}>
            <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
              <ThemedText type="subtitle" style={styles.sheetTitle}>
                {editing === 'ALL' ? 'Every working day' : editing ? prettyDay(editing.date) : ''}
              </ThemedText>
              {tripOf ? (
                <>
                  <Notice tone="info" title={entries[tripOf.date]?.dayKind === 'TRANSIT' ? 'Return day of a trip' : 'Stay day of a trip'}>
                    {`This day is part of the trip that starts on ${prettyDay(tripOf.start)}. To change it, edit that first day.`}
                  </Notice>
                  <PrimaryButton label="Open the first day" onPress={() => openDay(tripOf.start)} />
                </>
              ) : (
                <>
                  <PlanDayForm
                    value={sheet}
                    onChange={(next) => {
                      setSheet(next);
                      setSheetErrors({});
                    }}
                    errors={sheetErrors}
                    date={editing && editing !== 'ALL' ? editing.date : undefined}
                    lockedDates={lockedDates}
                  />
                  <PrimaryButton label="Done" onPress={applySheet} />
                  {editing && editing !== 'ALL' && entries[editing.date] ? (
                    <PrimaryButton label="Clear this day" variant="text" onPress={clearDay} />
                  ) : null}
                </>
              )}
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
  toggleWide: { alignSelf: 'flex-end', width: 300 },
  // Tablet: a fixed-width overview column beside the flexible day list.
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  side: { width: 360, gap: Spacing.three },
  main: { flex: 1 },
  dayWise: { gap: Spacing.two },
  dayWiseHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 16, lineHeight: 22 },
  footer: { flexDirection: 'row', gap: Spacing.two },
  footerButton: { flex: 1, minHeight: 48, borderRadius: Spacing.two + 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.two },
  outlined: { borderWidth: 1 },
  submit: { flex: 1.4 },
  footerLabel: { textAlign: 'center' },
  dim: { opacity: 0.5 },
  // The editor sheet: centred and capped so it doesn't stretch across a tablet.
  sheet: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  sheetTitle: { fontSize: 28, lineHeight: 34 },
});
