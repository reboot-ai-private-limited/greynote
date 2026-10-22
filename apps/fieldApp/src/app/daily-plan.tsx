import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { FormField } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { PlanDoctorsPicker } from '@/components/plan-doctors-picker';
import { describeDay, PlanDaySummary } from '@/components/plan-day-summary';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { ThemedText } from '@/components/themed-text';
import { CardSection, sym } from '@/components/ui-cards';
import { useTheme } from '@/hooks/use-theme';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useDayGate } from '@/hooks/use-day-gate';
import { useDoctorVisitGap } from '@/hooks/use-doctor-visit-gap';
import { useDownline } from '@/hooks/use-downline';
import { useFormErrors } from '@/hooks/use-form-errors';
import { ApiError } from '@/lib/api';
import {
  BLOCKED_TEXT,
  EDITABLE,
  LATE_TEXT,
  getCarryOver,
  getTeamSuggest,
  type TeamSuggestion,
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
import { WorkWithPicker } from '@/components/work-with-picker';
import { refreshNow, useColleagues, useOnline } from '@/offline';
import { useCachedSource } from '@/offline/cache';
import { addDays, formatWhen, monthOf, nowMs, prettyDay, prettyMonth } from '@/offline/day';
import { clearLocalDraft, loadLocalDraft, saveLocalDraft } from '@/offline/local-draft';
import type { ConfigSnapshot, FieldMasterDataSnapshot, PlanningSnapshot, TerritorySnapshot } from '@/types/sync';

type Msg = { tone: 'info' | 'warning' | 'danger' | 'success'; text: string };

const STATUS_TEXT: Record<string, string> = {
  DRAFT: 'Not submitted yet',
  SUBMITTED: 'Waiting for your manager’s approval',
  MANAGER_APPROVED: 'Approved by your manager',
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
 * day the doctors are the employee's own on the day's routes; missed calls still owed are added by the server and can't be
 * dropped. The day is submitted for approval every day (online only). An approved day is changed by the manager or Admin (amend).
 */
export default function DailyPlanScreen() {
  const theme = useTheme();
  const planning = useCachedSource<PlanningSnapshot>('planning');
  const config = useCachedSource<ConfigSnapshot>('config');
  const territory = useCachedSource<TerritorySnapshot>('territory');
  const master = useCachedSource<FieldMasterDataSnapshot>('fieldMasterData');
  const { colleagues } = useColleagues();
  const { isManager } = useCurrentUser();
  const downline = useDownline();
  const gate = useDayGate();
  const { today } = gate;
  const online = useOnline();

  const [date, setDate] = useState(today);
  // The doctors the MR ticked (not the owed ones) and the server's list of doctors owed from earlier days, kept with its date.
  const [doctorIds, setDoctorIds] = useState<string[]>([]);
  // The work-with being edited; null until the day is loaded (then the saved one shows).
  const [workWithDraft, setWorkWithDraft] = useState<string[] | null>(null);
  const [owedState, setOwedState] = useState<{ date: string; list: PlannedDoctor[] } | null>(null);
  const fe = useFormErrors(FIELD_ORDER);
  const [showOriginal, setShowOriginal] = useState(false);
  // A manager's snapshot of the routes and doctors of the people they work with (team-suggest), with the date it was read for.
  const [suggestion, setSuggestion] = useState<{ date: string; data: TeamSuggestion } | null>(null);
  const [suggesting, setSuggesting] = useState(false);
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
  const draftWorkWith = fieldDay ? (workWithDraft ?? existing?.workWith ?? []) : [];
  const blocked = gate.state === 'blocked';
  const timeZone = config.data?.settings.BUSINESS_TIMEZONE;

  const selectedMonth = monthOf(date);
  const monthPlan = planning.data?.monthlyPlans.find((m) => m.planMonth === selectedMonth) ?? null;
  const monthApproved = monthPlan?.status === 'MANAGER_APPROVED' || monthPlan?.status === 'APPROVED';
  // The weekly off or holiday this date falls on, from the sync snapshot (this and next month). Absent from an older server.
  const offDay = planning.data?.planOffDays?.find((o) => o.date === date) ?? null;

  /** Everything the server knows about this plan (online only). */
  const detailKey = `${date}:${existing?.id ?? 'none'}:${status}`;
  const detail = detailState?.key === detailKey ? detailState.detail : null;
  const rejectionKey = status === 'REJECTED' ? (existing?.approvalRequestId ?? null) : null;
  const rejection = rejectionKey !== null && rejectionState?.key === rejectionKey ? rejectionState.text : null;

  // Owed doctors: the server's answer for this date when we have it, else the ones the saved plan already carries.
  const savedOwed = useMemo(() => (existing?.doctors ?? []).filter((d) => d.carriedFrom !== null), [existing]);
  const owed = owedState?.date === date ? owedState.list : savedOwed;

  // Days between visits to a doctor (dcr.md rule 11), counted from this plan's date: a doctor visited too recently can't be
  // called that day, so it isn't offered for the plan either. Ticked ones (from before) can still be unticked.
  const visitGap = useDoctorVisitGap(date, null);
  const tooSoonPicked = doctorIds
    .map((id) => ({ id, soon: visitGap(id) }))
    .filter((p) => p.soon !== null)
    .map((p) => `${master.data?.doctors.find((d) => d.id === p.id)?.name ?? 'A doctor'}: ${p.soon!.short.toLowerCase()}`);

  const names = useMemo(
    () => ({
      routes: new Map((territory.data?.routes ?? []).map((r) => [r.id, r.name])),
      colleagues: new Map(colleagues.map((c) => [c.id, c])),
    }),
    [territory.data, colleagues],
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

  const dateOptions = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const d = addDays(today, i);
        return { value: d, label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : prettyDay(d) };
      }),
    [today],
  );

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
    // A manager working with team members may call their doctors too, which the phone's own doctor list does not hold:
    // what is ticked is sent as it is and the server checks it against the people named and the day's routes.
    if (isManager && draftWorkWith.length > 0) {
      const samePicks = doctorIds.length === serverPicks.length && doctorIds.every((id) => serverPicks.includes(id));
      const onServer = new Set(savedOwed.map((d) => d.doctorId));
      return { ids: doctorIds, changed: !samePicks || !owed.every((o) => onServer.has(o.doctorId)) };
    }
    if (!master.data) return { ids: serverPicks, changed: false };
    const onRoutes = new Set(master.data.doctors.filter((d) => existing.routeIds.includes(d.routeId)).map((d) => d.id));
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
        fe.fail({ [field]: errorText(err) });
        setMsg({ tone: 'danger', text: 'Fix the part marked in red.' });
      } else {
        setMsg({ tone: 'danger', text: errorText(err) });
      }
    } finally {
      setBusy(false);
    }
  }

  const refreshAll = () => Promise.all([refreshNow(), loadDetail()]);

  /**
   * A manager picked (or re-picked) the people to work with: read their plans' routes and doctors (online only) and fill the
   * doctor list from them. It is a snapshot: later changes to their plans show only after "Refresh from team", and the routes
   * the day takes are set by the server when the day is saved.
   */
  async function readTeam(ids: string[]) {
    if (!isManager || ids.length === 0 || !online) {
      setSuggestion(null);
      return;
    }
    setSuggesting(true);
    try {
      const data = await getTeamSuggest(date, ids);
      setSuggestion({ date, data });
      setDoctorIds(data.doctorIds);
      setMsg(null);
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setSuggesting(false);
    }
  }

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
      await withdrawPlan(existing.approvalRequestId);
      await refreshAll();
      return { tone: 'info', text: 'Plan withdrawn. You can change the day and submit again.' };
    });

  return (
    <ScreenShell title="Daily Plan">
      {existing ? (
        <Notice tone={status === 'REJECTED' ? 'danger' : approved ? 'success' : 'info'} title={`${prettyDay(date)}: ${STATUS_TEXT[existing.status] ?? existing.status}`}>
          {rejection ? `Reason: ${rejection}` : approved ? 'Need a change? Ask your manager.' : undefined}
        </Notice>
      ) : null}

      <View style={[{ gap: 12, borderWidth: 1, borderRadius: 16, padding: 16 }, { backgroundColor: theme.background, borderColor: theme.border }]}>
        <ThemedText type="smallBold">Date</ThemedText>
        <ChoiceChips options={dateOptions} value={date} onChange={setDate} />
        {existing ? (
          <>
            <ThemedText type="smallBold">Plan for the day</ThemedText>
            <PlanDaySummary text={describeDay(existing, names)} />
            {editable ? (
              <ThemedText type="small" themeColor="textSecondary">
                {fieldDay
                  ? 'The working type, routes and remarks come from your approved Tour Plan and can’t be changed here. You can change who you work with and the doctors.'
                  : 'The working type comes from your approved Tour Plan and can’t be changed here. This day has no routes or doctors.'}
              </ThemedText>
            ) : null}
          </>
        ) : null}
      </View>

      {existing && editable && fieldDay ? (
        <CardSection icon={sym('calendar', 'event')} accent="blue" title="Who you work with">
          <FormField form={fe} name="workWith">
            <WorkWithPicker
              value={draftWorkWith}
              onChange={(ids) => { fe.clear('workWith'); setWorkWithDraft(ids); void readTeam(ids); }}
              disabled={busy || blocked}
              people={isManager ? { list: downline.people, loaded: downline.loaded, emptyText: 'No team members under you yet.' } : undefined}
            />
          </FormField>
          {isManager && draftWorkWith.length > 0 ? (
            <View style={{ gap: 6 }}>
              {suggesting ? <ThemedText type="small" themeColor="textSecondary">Reading your team’s plans…</ThemedText> : null}
              {suggestion?.date === date
                ? suggestion.data.people.map((p) => (
                    <ThemedText key={p.userId} type="small" themeColor={p.source === 'NONE' ? 'danger' : 'textSecondary'}>
                      {`${p.name}: ${p.source === 'NONE' ? 'nothing planned this day' : p.source === 'DAILY_PLAN' ? `daily plan${p.planStatus ? ` (${p.planStatus.toLowerCase().replace(/_/g, ' ')})` : ''}` : 'monthly plan'} · ${p.routeIds.length} route${p.routeIds.length === 1 ? '' : 's'}, ${p.doctorIds.length} doctor${p.doctorIds.length === 1 ? '' : 's'}`}
                    </ThemedText>
                  ))
                : null}
              <ThemedText type="small" themeColor="textSecondary">
                Your day takes the routes of the people you work with, and the doctors below start from theirs. Save to apply.
              </ThemedText>
              <PrimaryButton label="Refresh from team" variant="text" disabled={busy || suggesting || !online} onPress={() => void readTeam(draftWorkWith)} />
            </View>
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

      {existing && fieldDay ? (
        editable ? (
          <CardSection icon={sym('stethoscope', 'medical_services')} accent="blue" title="Doctors to call">
            <FormField form={fe} name="doctorIds">
              <PlanDoctorsPicker routeIds={existing.routeIds} picked={doctorIds} owed={owed} onChange={(ids) => { fe.clear('doctorIds'); setDoctorIds(ids); }} disabled={busy || blocked} tooSoon={visitGap} />
            </FormField>
            {tooSoonPicked.length > 0 ? (
              <Notice tone="warning" title="Visited too recently">
                {`${tooSoonPicked.join('; ')}. A call on this day would be refused. Untick to plan another doctor.`}
              </Notice>
            ) : null}
            <ThemedText type="small" themeColor="textSecondary">
              Only your doctors on this day’s routes can be picked. Doctors you missed on earlier days stay on the plan until you call them.
            </ThemedText>
          </CardSection>
        ) : (
          <CardSection icon={sym('stethoscope', 'medical_services')} accent="blue" title="Doctors to call">
            <PlanDoctorsPicker readOnly routeIds={existing.routeIds} picked={plannedPicks(existing)} owed={savedOwed} onChange={setDoctorIds} />
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
        {status === 'SUBMITTED' ? <PrimaryButton label="Withdraw" variant="text" loading={busy} onPress={withdraw} /> : null}
      </View>
    </ScreenShell>
  );
}
