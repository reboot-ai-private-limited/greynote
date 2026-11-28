import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Alert } from '@/lib/alert';

import { FormField } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { OutletPicker } from '@/components/outlet-picker';
import { PlanDoctorsPicker } from '@/components/plan-doctors-picker';
import { describeDay, PlanDaySummary } from '@/components/plan-day-summary';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { ThemedText } from '@/components/themed-text';
import { CardSection, sym } from '@/components/ui-cards';
import { useTheme } from '@/hooks/use-theme';
import { useCallDoctors } from '@/hooks/use-call-doctors';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useDayGate } from '@/hooks/use-day-gate';
import { useDoctorVisitGap } from '@/hooks/use-doctor-visit-gap';
import { useFormErrors } from '@/hooks/use-form-errors';
import { ApiError } from '@/lib/api';
import {
  BLOCKED_TEXT,
  EDITABLE,
  LATE_TEXT,
  getCarryOver,
  getDailyPlanRoutes,
  getWorkWithOptions,
  type WorkWithOptions,
  getDailyPlanDetail,
  getRejectionReason,
  isFieldDay,
  offDayLabel,
  planErrorText,
  saveDailyPlan,
  submitDailyPlan,
  withdrawPlan,
  type DailyPlanDetail,
  type PlannedDoctor,
} from '@/lib/planning';
import { dayWhere } from '@/lib/places';
import { getTeamToday, type TeamDayRow } from '@/lib/team-section';
import { WorkWithPicker } from '@/components/work-with-picker';
import { refreshNow, useColleagues, useOnline, useRecords, type CallPayload } from '@/offline';
import { useCachedSource } from '@/offline/cache';
import { useCachedFetch } from '@/offline/cached-fetch';
import { getDailyPlanRecord, type DailyPlanRecord } from '@/lib/approvals';
import { formatWhen, monthOf, nowMs, prettyDay, prettyMonth } from '@/offline/day';
import { clearLocalDraft, loadLocalDraft, saveLocalDraft } from '@/offline/local-draft';
import type { ConfigSnapshot, FieldMasterDataSnapshot, PlanningSnapshot, TerritorySnapshot } from '@/types/sync';

type Msg = { tone: 'info' | 'warning' | 'danger' | 'success'; text: string };

const STATUS_TEXT: Record<string, string> = {
  DRAFT: 'Not submitted yet',
  // One approval (2026-10-23): the manager or Admin. MANAGER_APPROVED only on older plans, and it means approved.
  SUBMITTED: 'Waiting for approval',
  MANAGER_APPROVED: 'Approved',
  APPROVED: 'Approved',
  REJECTED: 'Rejected by your manager — check the day and submit again',
  WITHDRAWN: 'Withdrawn — submit it again when ready',
  REOPENED: 'Reopened by Admin — check the day and submit again',
};

/** The doctors the MR picked on a saved plan (the owed ones, `carriedFrom` set, are the server's to add). */
const plannedPicks = (plan: { doctors?: PlannedDoctor[] } | null): string[] =>
  (plan?.doctors ?? []).filter((d) => d.carriedFrom === null).map((d) => d.doctorId);

/** What an unsent change to the day is kept as on the phone. Older drafts hold only the doctors. */
type LocalDraft = { doctorIds: string[]; workWith?: string[] };

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));

const errorText = planErrorText;

/** The fields of this screen the server can name in a `400` (its `field`), top to bottom. */
const FIELD_ORDER = ['workWith', 'doctorIds'];

/**
 * Daily Plan (docs/mobile/dailyplan.md). The day starts from the approved Monthly Plan. While it is editable the employee can
 * change its working type, who they work with and the doctors to call (one Save); the routes and remarks stay the Monthly Plan's
 * and are set by the server, so they are shown read-only. A Meeting, Conference or Strike day has no routes or doctors. On a field
 * day an MR's doctors are their own on the day's routes, and a manager's are their own or anyone's in their downline, on any route;
 * missed calls still owed are added by the server and can't be dropped. The day is submitted for approval every day (online only).
 * An approved day is changed by the manager or Admin (amend).
 */
export default function DailyPlanScreen() {
  const theme = useTheme();
  const planning = useCachedSource<PlanningSnapshot>('planning');
  const config = useCachedSource<ConfigSnapshot>('config');
  const territory = useCachedSource<TerritorySnapshot>('territory');
  const master = useCachedSource<FieldMasterDataSnapshot>('fieldMasterData');
  const { colleagues } = useColleagues();
  const { isManager } = useCurrentUser();
  const { byId: callDoctorById, teamMissing } = useCallDoctors();
  const gate = useDayGate();
  const { today } = gate;
  const online = useOnline();

  // The business day only (2026-11-28): it follows DAY_START_TIME, so a later day's plan opens when that day starts.
  const date = today;
  // Doctors already called on this day (the phone's own call records, as the call screen reads them): they leave "Doctors to call".
  const { records: callRecords } = useRecords(['DOCTOR_CALL']);
  const calledIds = useMemo(
    () => new Set(callRecords.filter((r) => !r.deleted && (r.payload as CallPayload).reportDate === date).map((r) => (r.payload as CallPayload).doctorId ?? '')),
    [callRecords, date],
  );
  // The doctors the MR ticked (not the owed ones) and the server's list of doctors owed from earlier days, kept with its date.
  const [doctorIds, setDoctorIds] = useState<string[]>([]);
  // The work-with being edited; null until the day is loaded (then the saved one shows).
  const [workWithDraft, setWorkWithDraft] = useState<string[] | null>(null);
  const [owedState, setOwedState] = useState<{ date: string; list: PlannedDoctor[] } | null>(null);
  const fe = useFormErrors(FIELD_ORDER);
  const [showOriginal, setShowOriginal] = useState(false);
  // A manager is route first (dailyplan.md §1b, 2026-11-17): which of the day's approved routes the day covers; null = as saved.
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  // What the server said, kept with the plan it belongs to: a different day or plan reads as "not loaded yet".
  const [rejectionState, setRejectionState] = useState<{ key: string; text: string | null } | null>(null);
  const [detailState, setDetailState] = useState<{ key: string; detail: DailyPlanDetail | null } | null>(null);

  const existing = planning.data?.dailyPlans.find((p) => p.planDate === date) ?? null;
  const status = existing?.status ?? null;
  const editable = existing !== null && EDITABLE.includes(status);
  const approved = status === 'APPROVED' || status === 'MANAGER_APPROVED';
  // The working type is the Tour Plan's and isn't changed here. Work With and doctors are for Field Work and Doctor Campaign days only.
  const fieldDay = existing !== null && isFieldDay(existing.workingType);
  const managerDay = isManager && existing !== null && fieldDay;
  const blocked = gate.state === 'blocked';
  const timeZone = config.data?.settings.BUSINESS_TIMEZONE;

  const selectedMonth = monthOf(date);
  const monthPlan = planning.data?.monthlyPlans.find((m) => m.planMonth === selectedMonth) ?? null;
  // A day's routes are its Tour Plan day's (decision-log 2026-11-19): the Tour Plan changed after this plan was sent when they differ.
  const tourEntry = monthPlan?.entries.find((e) => e.planDate === date) ?? null;
  const tourRoutesDiffer = existing !== null && tourEntry !== null && [...tourEntry.routeIds].sort().join() !== [...existing.routeIds].sort().join();
  // A month that was approved and then reopened (or sent again) stays open for daily work, as on the server.
  const monthApproved = monthPlan?.status === 'MANAGER_APPROVED' || monthPlan?.status === 'APPROVED' || (monthPlan?.wasApproved === true && (monthPlan.status === 'REOPENED' || monthPlan.status === 'SUBMITTED'));
  // The weekly off or holiday this date falls on, from the sync snapshot (this and next month). Absent from an older server.
  const offDay = planning.data?.planOffDays?.find((o) => o.date === date) ?? null;

  /** Everything the server knows about this plan (online only). */
  const detailKey = `${date}:${existing?.id ?? 'none'}:${status}`;
  const detail = detailState?.key === detailKey ? detailState.detail : null;

  // A manager's day (2026-11-27): the Tour Plan's From → To; "Works with" offers the people below whose plan that day is approved at the same
  // place (`work-with-options`, online; kept for offline), and the manager's doctors are the ones those people planned — never picked.
  const optionsKey = managerDay ? `plan-work-with:${date}` : 'plan-work-with:none';
  const workWithOptions = useCachedFetch<WorkWithOptions | null>(optionsKey, async () => (managerDay ? getWorkWithOptions(date) : null));
  const optionPeople = useMemo(() => new Set((workWithOptions.data?.people ?? []).map((p) => p.id)), [workWithOptions.data]);
  // Someone saved earlier who no longer qualifies is dropped, not carried into the save (the server would refuse it).
  const draftWorkWith = fieldDay
    ? (workWithDraft ?? existing?.workWith ?? []).filter((id) => !managerDay || !workWithOptions.data || optionPeople.has(id))
    : [];
  const teamDoctorIds = [...new Set((workWithOptions.data?.people ?? []).filter((p) => draftWorkWith.includes(p.id)).flatMap((p) => p.doctorIds))];
  const rejectionKey = status === 'REJECTED' ? (existing?.approvalRequestId ?? null) : null;
  const rejection = rejectionKey !== null && rejectionState?.key === rejectionKey ? rejectionState.text : null;

  // Owed doctors: the server's answer for this date when we have it, else the ones the saved plan already carries.
  // Owed doctors: the ones the saved plan carries, plus (for today) the ones the server worked out at the last pull. A plan approved before
  // a doctor was missed never stored that doctor, so the pull's list is what keeps it showing.
  const savedOwed = useMemo(() => {
    const stored = (existing?.doctors ?? []).filter((d) => d.carriedFrom !== null);
    if (date !== planning.data?.today) return stored;
    const extra = (planning.data?.owedDoctors ?? []).filter((o) => !stored.some((d) => d.doctorId === o.doctorId));
    return [...stored, ...extra];
  }, [existing, date, planning.data]);
  // A manager has no carry-over (2026-11-27): they call what their team planned that day.
  const owed = isManager ? [] : owedState?.date === date ? owedState.list : savedOwed;

  // Days between visits to a doctor (dcr.md rule 11), counted from this plan's date: a doctor visited too recently can't be
  // called that day, so it isn't offered for the plan either. Ticked ones (from before) can still be unticked.
  const visitGap = useDoctorVisitGap(date, null);
  const tooSoonPicked = doctorIds
    .map((id) => ({ id, soon: visitGap(id) }))
    .filter((p) => p.soon !== null)
    .map((p) => `${callDoctorById.get(p.id)?.name ?? 'A doctor'}: ${p.soon!.short.toLowerCase()}`);

  // The team's day (dailyplan.md section 1b). The server only answers for today or earlier, so it can't say who is away on a later day.
  // A manager's doctors, read only, by who planned them (2026-11-28): the plan read by id says which work-with person planned each.
  // Read again whenever the plan's people or status change.
  const managerDoctors = useCachedFetch<DailyPlanRecord | null>(
    isManager && existing ? `plan-record:${existing.id}:${existing.status}:${existing.workWith.join(',')}` : 'plan-record:none',
    async () => (isManager && existing ? getDailyPlanRecord(existing.id) : null),
  );
  const doctorGroups = Object.values(
    (managerDoctors.data?.doctors ?? []).reduce<Record<string, { who: string; names: string[] }>>((acc, d) => {
      const key = d.plannedBy?.id ?? '-';
      (acc[key] ??= { who: d.plannedBy?.label ?? 'Others', names: [] }).names.push(d.name ?? 'Doctor');
      return acc;
    }, {}),
  );
  const showTeamToday = isManager && date === today;
  const teamToday = useCachedFetch<TeamDayRow[]>(showTeamToday ? `plan-team-today:${today}` : 'plan-team-today:none', async () =>
    showTeamToday ? (await getTeamToday({ date: today })).items : [],
  );
  const away = (teamToday.data ?? []).filter((r) => r.state === 'ON_LEAVE' || r.state === 'OFF');
  // A manager's day can take routes they don't hold, which only the server can name.
  const savedRoutes = useCachedFetch(
    isManager && existing ? `plan-routes:${existing.id}` : 'plan-routes:none',
    async () => (isManager && existing ? getDailyPlanRoutes(existing.id) : []),
    existing?.routeIds.join(','),
  );

  const names = useMemo(
    () => ({
      routes: new Map([
        ...(teamToday.data ?? []).flatMap((r) => r.plan?.routes ?? []).map((r): [string, string] => [r.id, r.name]),
        ...(savedRoutes.data ?? []).map((r): [string, string] => [r.id, r.name]),
        ...(territory.data?.routes ?? []).map((r): [string, string] => [r.id, r.name]),
      ]),
      colleagues: new Map(colleagues.map((c) => [c.id, c])),
    }),
    [territory.data, colleagues, teamToday.data, savedRoutes.data],
  );

  const fetchDetail = useCallback(async () => {
    if (!online || !existing) return null;
    try {
      return { key: detailKey, detail: await getDailyPlanDetail(date) };
    } catch {
      return null; // Keep what the phone already has; the snapshot is enough to work from.
    }
  }, [date, online, detailKey, existing]);
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

  // Load the doctor picks when the day (or the plan behind it) changes — not on every refresh, which would wipe the ticks.
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!planning.loaded) return;
    const key = `${date}:${existing?.id ?? 'none'}`;
    if (loadedFor.current === key) return;
    loadedFor.current = key;
    setMsg(null);
    void loadLocalDraft<LocalDraft>(`daily:${date}`).then((local) => {
      const kept = local !== null && editable;
      setDoctorIds(kept && local.doctorIds ? local.doctorIds : plannedPicks(existing));
      setWorkWithDraft(kept && local.workWith ? local.workWith : null);
    });
  }, [planning.loaded, date, existing, editable]);

  // A doctor the server took off this plan since it was loaded (unassigned, moved or deactivated, doctors.md D2) comes off the
  // ticks too, so it isn't sent back and refused. Other ticks made here stay.
  const lastServerPicks = useRef<{ key: string; picks: string[] } | null>(null);
  useEffect(() => {
    if (!existing) return;
    const key = `${date}:${existing.id}`;
    const picks = plannedPicks(existing);
    const last = lastServerPicks.current;
    lastServerPicks.current = { key, picks };
    if (last?.key !== key) return;
    const gone = last.picks.filter((id) => !picks.includes(id));
    if (gone.length > 0) setDoctorIds((current) => current.filter((id) => !gone.includes(id)));
  }, [date, existing]);

  // Doctors still owed from earlier days (online only; offline the saved plan's own list is shown).
  useEffect(() => {
    if (!online || !fieldDay) return;
    let alive = true;
    getCarryOver(date)
      .then((list) => {
        if (alive) setOwedState({ date, list });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [date, online, fieldDay]);

  useEffect(() => {
    if (rejectionKey && online) {
      getRejectionReason(rejectionKey).then((text) => setRejectionState({ key: rejectionKey, text })).catch(() => undefined);
    }
  }, [rejectionKey, online]);


  // The server's deadline only — never worked out on the phone (its clock may be wrong; the server decides at submit).
  const deadlineIso = detail?.submitDeadline ?? existing?.submitDeadline ?? null;
  const deadlinePassed = deadlineIso !== null && nowMs() > Date.parse(deadlineIso);
  const resubmitUntil = detail?.resubmitAllowedUntil ?? null;
  const lateUntil = detail?.lateSubmitAllowedUntil ?? null;
  const lateButAllowed = editable && deadlinePassed && (resubmitUntil !== null || lateUntil !== null);
  const lateAndRefused = editable && deadlinePassed && !lateButAllowed;
  const amendment = detail?.amendments?.length ? detail.amendments[detail.amendments.length - 1]! : null;
  // The employee changed the day the Monthly Plan wrote; `plannedFrom` is what the Monthly Plan said (the doctors are not part of it).
  const changedFromMonthly = detail?.changedFromMonthly === true && detail.plannedFrom != null;
  const monthlyDay = changedFromMonthly ? (detail?.plannedFrom ?? null) : null;

  /**
   * The doctors to send, and whether they differ from the server's list. Picks off the day's routes are dropped (the server
   * refuses them); with no Field Master Data on the phone nothing is sent, so a missing cache can't wipe the saved picks.
   */
  function doctorChange(): { ids: string[]; changed: boolean } {
    const serverPicks = plannedPicks(existing);
    if (!existing) return { ids: serverPicks, changed: false };
    // A day that is not a field day has no doctors.
    if (!fieldDay) return { ids: [], changed: serverPicks.length > 0 };
    // A manager picks no doctors (2026-11-27): the server takes the ones their work-with people planned, so nothing is sent.
    if (isManager) return { ids: [], changed: false };
    if (!master.data) return { ids: serverPicks, changed: false };
    // The day's doctors are those at its To place (2026-11-27, as the picker and the server); an older day without places goes by its routes.
    const toPlaceId = existing.toPlaceId ?? null;
    const onRoutes = new Set(master.data.doctors.filter((d) => (toPlaceId ? d.placeId === toPlaceId : existing.routeIds.includes(d.routeId))).map((d) => d.id));
    const ids = doctorIds.filter((id) => onRoutes.has(id));
    const samePicks = ids.length === serverPicks.length && ids.every((id) => serverPicks.includes(id));
    const onServer = new Set(savedOwed.map((d) => d.doctorId));
    const owedCovered = owed.every((o) => onServer.has(o.doctorId));
    return { ids, changed: !samePicks || !owedCovered };
  }

  async function run(action: () => Promise<Msg | null>) {
    setBusy(true);
    setMsg(null);
    fe.clearAll();
    try {
      const result = await action();
      if (result) setMsg(result);
    } catch (err) {
      // A `400` that names the work-with or the doctors marks that part of the screen in red with the server's words.
      const field = err instanceof ApiError && err.status === 400 ? err.data?.field : undefined;
      if (typeof field === 'string' && FIELD_ORDER.includes(field)) {
        // A refused doctor list names which ones (dailyplan.md rule 2a), so say which to untick.
        const refused = err instanceof ApiError && Array.isArray(err.data?.doctorIds) ? (err.data.doctorIds as string[]) : [];
        const who = refused.map((id) => callDoctorById.get(id)?.name ?? 'Team member’s doctor');
        fe.fail({ [field]: who.length > 0 ? `${errorText(err)} Untick: ${who.join(', ')}.` : errorText(err) });
        setMsg({ tone: 'danger', text: 'Fix the part marked in red.' });
      } else {
        setMsg({ tone: 'danger', text: errorText(err) });
      }
    } finally {
      setBusy(false);
    }
  }

  const refreshAll = () => Promise.all([refreshNow(), loadDetail()]);

  const localDraft = (): LocalDraft => ({ doctorIds, workWith: draftWorkWith });

  /** Whether the work-with or doctors differ from what the server has. */
  function dayChanged(): boolean {
    if (!existing) return false;
    return !sameIds(draftWorkWith, existing.workWith) || doctorChange().changed;
  }

  /** Sends the day's working type (as it is), work-with and doctors together; the server sets the routes and returns the whole plan. */
  async function sendDay() {
    if (!existing) return;
    const saved = await saveDailyPlan(date, { workingType: existing.workingType, workWith: draftWorkWith, doctorIds: doctorChange().ids });
    // Show what the server saved until the refreshed plan arrives (clearing the draft would flash the old list back).
    setWorkWithDraft(saved.workWith);
    setDoctorIds(plannedPicks(saved));
    await clearLocalDraft(`daily:${date}`);
  }

  const saveDay = () =>
    run(async () => {
      if (!online) {
        await saveLocalDraft(`daily:${date}`, localDraft());
        return { tone: 'info', text: 'Your changes are kept on this phone. Connect to the internet to save them.' };
      }
      if (!dayChanged()) return { tone: 'info', text: 'Nothing has changed since the last save.' };
      await sendDay();
      await refreshAll();
      return { tone: 'success', text: 'Day saved.' };
    });

  /** Saves the day as the Monthly Plan wrote it (the server then clears "changed from monthly"); the doctors picked are kept. */
  const backToMonthly = () =>
    run(async () => {
      if (!existing || !monthlyDay) return null;
      if (!online) return { tone: 'warning', text: 'Connect to the internet to go back to the monthly plan.' };
      const doctorIdsToKeep = isFieldDay(monthlyDay.workingType) ? doctorChange().ids : [];
      const saved = await saveDailyPlan(date, { workingType: monthlyDay.workingType, workWith: monthlyDay.workWith, doctorIds: doctorIdsToKeep });
      setWorkWithDraft(saved.workWith);
      setDoctorIds(plannedPicks(saved));
      setShowOriginal(false);
      await clearLocalDraft(`daily:${date}`);
      await refreshAll();
      return { tone: 'success', text: 'The day is back as your monthly plan has it.' };
    });

  const submit = () => {
    if (!online) {
      Alert.alert('No connection', 'Submitting a plan needs the internet. Your changes are kept — try again when you’re back online.');
      void saveLocalDraft(`daily:${date}`, localDraft());
      return;
    }
    return run(async () => {
      if (!existing) return null;
      if (dayChanged()) await sendDay();
      await submitDailyPlan(existing.id);
      await clearLocalDraft(`daily:${date}`);
      await refreshAll();
      Alert.alert('Plan submitted', 'Your manager will be asked to approve it.', [{ text: 'OK', onPress: () => router.back() }]);
      return null;
    });
  };

  const withdraw = () =>
    run(async () => {
      if (!existing?.approvalRequestId) return null;
      if (!online) return { tone: 'warning', text: 'Connect to the internet to withdraw.' };
      try {
        await withdrawPlan(existing.approvalRequestId);
      } catch (err) {
        // Already decided or withdrawn: show the plan as it really is, under the server's message.
        if (err instanceof ApiError && err.status === 409) await refreshAll();
        throw err;
      }
      await refreshAll();
      return { tone: 'info', text: 'Plan withdrawn, so it can’t be approved as it was. Change the day and submit it again.' };
    });

  return (
    <ScreenShell title="Daily Plan">
      {existing ? (
        <Notice tone={status === 'REJECTED' ? 'danger' : approved ? 'success' : 'info'} title={`${prettyDay(date)}: ${STATUS_TEXT[existing.status] ?? existing.status}`}>
          {rejection ? `Reason: ${rejection}` : approved ? 'Need a change? Ask your manager.' : undefined}
        </Notice>
      ) : null}

      {existing && status === 'SUBMITTED' && fieldDay && tourRoutesDiffer ? (
        <Notice tone="warning" title="The Tour Plan changed after you sent this">
          {`Your manager can't approve it while its routes differ from the Tour Plan. Withdraw it, check the routes, and send it again.`}
        </Notice>
      ) : null}
      {existing && status === 'SUBMITTED' && fieldDay && tourRoutesDiffer ? <PrimaryButton label="Withdraw it" variant="text" loading={busy} onPress={withdraw} /> : null}

      <View style={[{ gap: 12, borderWidth: 1, borderRadius: 16, padding: 16 }, { backgroundColor: theme.background, borderColor: theme.border }]}>
        <ThemedText type="smallBold">{`Today · ${prettyDay(date)}`}</ThemedText>
        {existing ? (
          <>
            <ThemedText type="smallBold">Plan for the day</ThemedText>
            <PlanDaySummary text={describeDay(existing, names)} />
            {editable ? (
              <ThemedText type="small" themeColor="textSecondary">
                {fieldDay
                  ? (managerDay
                    ? 'The working type, routes and remarks come from your approved Tour Plan. You choose who you work with and the doctors on those routes.'
                    : 'The working type, routes and remarks come from your approved Tour Plan and can’t be changed here. You can change who you work with and the doctors.')
                  : 'The working type comes from your approved Tour Plan and can’t be changed here. This day has no routes or doctors.'}
              </ThemedText>
            ) : null}
          </>
        ) : null}
      </View>

      {existing && editable && fieldDay && managerDay ? (
        <CardSection icon={sym('calendar', 'event')} accent="blue" title="Who you work with">
          <ThemedText type="small" themeColor="textSecondary">
            {`${dayWhere(existing, territory.data) ?? 'Your Tour Plan’s place'}. You can work with the people below you whose plan for this day is approved and goes to the same place.`}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">You call the doctors the people you work with planned. Any other doctor is a follow-up.</ThemedText>
          <FormField form={fe} name="workWith">
            <OutletPicker
              label="Who you work with"
              multiple
              searchable
              values={draftWorkWith}
              onChangeValues={(ids) => {
                fe.clear('workWith');
                setWorkWithDraft(ids);
              }}
              options={(workWithOptions.data?.people ?? []).map((p) => ({ id: p.id, name: `${p.label} (${p.doctorIds.length} doctor${p.doctorIds.length === 1 ? '' : 's'})` }))}
              disabled={busy || blocked || !workWithOptions.data}
              emptyText="Nobody below you has an approved plan at this place."
            />
          </FormField>
          {workWithOptions.data && workWithOptions.data.people.length === 0 ? (
            <Notice tone="info" title="Nobody to work with here">
              Nobody below you has an approved plan at this place for this day. You can still go: log follow-ups for the doctors and chemists you meet.
            </Notice>
          ) : null}
          {!workWithOptions.data && !workWithOptions.loading ? <Notice tone="info">Connect to the internet once to load who you can work with.</Notice> : null}
          {away.length > 0 ? (
            <Notice tone={away.some((r) => draftWorkWith.includes(r.user.id)) ? 'warning' : 'info'} title="Away today">
              {away.map((r) => `${r.user.name} (${r.state === 'ON_LEAVE' ? 'on leave' : 'off'})`).join(', ')}
            </Notice>
          ) : null}
        </CardSection>
      ) : null}

      {existing && editable && fieldDay && !managerDay ? (
        <CardSection icon={sym('calendar', 'event')} accent="blue" title="Who you work with">
          <FormField form={fe} name="workWith">
            <WorkWithPicker
              value={draftWorkWith}
              onChange={(ids) => { fe.clear('workWith'); setWorkWithDraft(ids); }}
              disabled={busy || blocked}
            />
          </FormField>
          {away.length > 0 ? (
            <Notice tone={away.some((r) => draftWorkWith.includes(r.user.id)) ? 'warning' : 'info'} title="Away today">
              {away.map((r) => `${r.user.name} (${r.state === 'ON_LEAVE' ? 'on leave' : 'off'})`).join(', ')}
            </Notice>
          ) : null}
        </CardSection>
      ) : null}

      {blocked ? <Notice tone="danger" title="Account blocked">{BLOCKED_TEXT}</Notice> : null}

      {!monthApproved && planning.loaded && !offDay ? (
        <>
          <Notice tone="danger" title={`Tour Plan for ${prettyMonth(selectedMonth)} isn’t approved`}>
            {`Your tour plan for ${prettyMonth(selectedMonth)} isn’t approved yet. There is no daily plan, and no work, until it is.`}
          </Notice>
          <PrimaryButton label="Go to Tour Plan" variant="text" onPress={() => router.push({ pathname: '/monthly-plan', params: selectedMonth === monthOf(today) ? { month: 'current' } : {} })} />
        </>
      ) : null}

      {offDay && !existing ? (
        // A weekly off or a holiday can't be on the Monthly Plan, so it has no Daily Plan (docs/mobile/dailyplan.md rule 1).
        <Notice tone="info" title={`${prettyDay(date)}: ${offDayLabel(offDay)}`}>There is no Daily Plan for this day. Nothing needs to be planned or reported.</Notice>
      ) : monthApproved && planning.loaded && !existing ? (
        <Notice tone="warning" title={prettyDay(date)}>There is no plan for this day. Ask your manager.</Notice>
      ) : null}
      {offDay && existing ? (
        // HR added the day off after this plan was written, so the server keeps the plan as it is.
        <Notice tone="info" title={`${prettyDay(date)}: ${offDayLabel(offDay)}`}>This day was planned before it became a holiday or weekly off, so the plan stays. Ask your manager if it should change.</Notice>
      ) : null}

      {amendment ? (
        <Notice tone="warning" title="Your manager or Admin changed this day">
          {`${formatWhen(amendment.at, timeZone)} — ${amendment.reason}`}
        </Notice>
      ) : null}

      {existing && monthlyDay ? (
        <View style={{ gap: 8 }}>
          <Notice tone="info" title="Changed from monthly">
            {showOriginal ? `Your monthly plan said: ${describeDay(monthlyDay, names)}` : 'You changed this day from what your monthly plan said.'}
          </Notice>
          <PrimaryButton label={showOriginal ? 'Hide the monthly plan' : 'Show the monthly plan'} variant="text" onPress={() => setShowOriginal((s) => !s)} />
          {editable ? <PrimaryButton label="Back to monthly plan" variant="text" loading={busy} disabled={blocked} onPress={backToMonthly} /> : null}
        </View>
      ) : null}

      {editable && !deadlinePassed && deadlineIso ? <Notice tone="info">{`Submit by ${formatWhen(deadlineIso, timeZone)}.`}</Notice> : null}
      {lateAndRefused ? <Notice tone="warning" title="Deadline passed">{LATE_TEXT}</Notice> : null}
      {lateButAllowed && resubmitUntil ? (
        <Notice tone="warning" title="You can still resubmit">
          {`You can still resubmit until ${formatWhen(resubmitUntil, timeZone)}.`}
        </Notice>
      ) : null}
      {lateButAllowed && !resubmitUntil && lateUntil ? (
        <Notice tone="warning" title="Late-submission exception">
          {`Admin allowed a late submission until ${formatWhen(lateUntil, timeZone)}.`}
        </Notice>
      ) : null}

      {!online && editable ? (
        <Notice tone="info">You’re offline. You can change who you work with and the doctors and keep them on this phone; saving and submitting need the internet.</Notice>
      ) : null}

      {/* A manager picks no doctors (2026-11-28): they see, read only, those the people they work with planned, by person. */}
      {existing && fieldDay && isManager && existing.workWith.length > 0 ? (
        <CardSection icon={sym('stethoscope', 'medical_services')} accent="blue" title="Doctors to call" count={managerDoctors.data?.doctors?.length}>
          <ThemedText type="small" themeColor="textSecondary">From the people you work with. Any other doctor is a follow-up.</ThemedText>
          {doctorGroups.length > 0 ? (
            doctorGroups.map((g) => (
              <ThemedText key={g.who} type="small">
                <ThemedText type="smallBold">{`${g.who}: `}</ThemedText>
                {g.names.join(', ')}
              </ThemedText>
            ))
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              {managerDoctors.data ? 'They planned no doctors for this day yet.' : online ? 'Loading…' : 'Connect to the internet to see their doctors.'}
            </ThemedText>
          )}
        </CardSection>
      ) : null}
      {existing && fieldDay && !isManager ? (
        editable ? (
          <CardSection icon={sym('stethoscope', 'medical_services')} accent="blue" title="Doctors to call">
            {managerDay ? (
              // A manager's doctors are the ones the people they work with planned (2026-11-27): shown, not picked.
              <PlanDoctorsPicker readOnly routeIds={existing.routeIds} picked={teamDoctorIds} owed={[]} onChange={setDoctorIds} calledIds={calledIds} />
            ) : (
              <FormField form={fe} name="doctorIds">
                <PlanDoctorsPicker routeIds={existing.routeIds} toPlaceId={existing.toPlaceId ?? null} picked={doctorIds} owed={owed} onChange={(ids) => { fe.clear('doctorIds'); setDoctorIds(ids); }} disabled={busy || blocked} tooSoon={visitGap} calledIds={calledIds} />
              </FormField>
            )}
            {tooSoonPicked.length > 0 ? (
              <Notice tone="warning" title="Visited too recently">
                {`${tooSoonPicked.join('; ')}. A call on this day would be refused. Untick to plan another doctor.`}
              </Notice>
            ) : null}
            {teamMissing ? <Notice tone="info">Your team’s doctors haven’t loaded yet. Connect to the internet to pick them.</Notice> : null}
            {managerDay && teamDoctorIds.length === 0 ? (
              <Notice tone="info">{draftWorkWith.length === 0 ? 'Choose who you work with to see their doctors.' : 'The people you work with planned no doctors for this day.'}</Notice>
            ) : null}
            <ThemedText type="small" themeColor="textSecondary">
              {isManager
                ? 'You call the doctors the people you work with planned. Any other doctor is a follow-up.'
                : 'Only your doctors at this day’s place can be picked. Doctors you missed on earlier days stay on the plan until you call them.'}
            </ThemedText>
          </CardSection>
        ) : (
          <CardSection icon={sym('stethoscope', 'medical_services')} accent="blue" title="Doctors to call">
            <PlanDoctorsPicker readOnly routeIds={existing.routeIds} picked={plannedPicks(existing)} owed={savedOwed} onChange={setDoctorIds} calledIds={calledIds} />
          </CardSection>
        )
      ) : null}

      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

      <View style={{ gap: 12 }}>
        {editable ? (
          <>
            <PrimaryButton label="Submit for approval" loading={busy} disabled={blocked || lateAndRefused} onPress={submit} />
            {fieldDay ? <PrimaryButton label="Save changes" variant="text" disabled={busy || blocked} onPress={saveDay} /> : null}
          </>
        ) : null}
        {status === 'SUBMITTED' ? <PrimaryButton label="Withdraw to change it" variant="text" loading={busy} onPress={withdraw} /> : null}
      </View>
    </ScreenShell>
  );
}
