import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { Notice } from '@/components/notice';
import { PlanDoctorsPicker } from '@/components/plan-doctors-picker';
import { describeDay, PlanDaySummary } from '@/components/plan-day-summary';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { ThemedText } from '@/components/themed-text';
import { CardSection, sym } from '@/components/ui-cards';
import { useTheme } from '@/hooks/use-theme';
import { useDayGate } from '@/hooks/use-day-gate';
import {
  BLOCKED_TEXT,
  EDITABLE,
  LATE_TEXT,
  getCarryOver,
  getDailyPlanDetail,
  getRejectionReason,
  isFieldDay,
  planErrorText,
  setDailyPlanDoctors,
  submitDailyPlan,
  withdrawPlan,
  type DailyPlanDetail,
  type PlannedDoctor,
} from '@/lib/planning';
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
  REJECTED: 'Rejected by your manager — check the doctors and submit again',
  WITHDRAWN: 'Withdrawn — submit it again when ready',
  REOPENED: 'Reopened by Admin — check the doctors and submit again',
};

/** The doctors the MR picked on a saved plan (the owed ones, `carriedFrom` set, are the server's to add). */
const plannedPicks = (plan: { doctors?: PlannedDoctor[] } | null): string[] =>
  (plan?.doctors ?? []).filter((d) => d.carriedFrom === null).map((d) => d.doctorId);

/** What an unsent doctor list is kept as on the phone. */
type LocalDraft = { doctorIds: string[] };

const errorText = planErrorText;

/**
 * Daily Plan (docs/mobile/dailyplan.md). The day comes from the approved Monthly Plan: its working type, routes, work-with
 * and remarks are read-only here. On a Field Work or Doctor Campaign day the employee picks the doctors to call — only their
 * own doctors on the day's routes; missed calls still owed are added by the server and can't be dropped — and submits the day
 * for approval every day (online only). An approved day can't be changed in the app: the manager or Admin amends it.
 */
export default function DailyPlanScreen() {
  const theme = useTheme();
  const planning = useCachedSource<PlanningSnapshot>('planning');
  const config = useCachedSource<ConfigSnapshot>('config');
  const territory = useCachedSource<TerritorySnapshot>('territory');
  const master = useCachedSource<FieldMasterDataSnapshot>('fieldMasterData');
  const { colleagues } = useColleagues();
  const gate = useDayGate();
  const { today } = gate;
  const online = useOnline();

  const [date, setDate] = useState(today);
  // The doctors the MR ticked (not the owed ones) and the server's list of doctors owed from earlier days, kept with its date.
  const [doctorIds, setDoctorIds] = useState<string[]>([]);
  const [owedState, setOwedState] = useState<{ date: string; list: PlannedDoctor[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  // What the server said, kept with the plan it belongs to: a different day or plan reads as "not loaded yet".
  const [rejectionState, setRejectionState] = useState<{ key: string; text: string | null } | null>(null);
  const [detailState, setDetailState] = useState<{ key: string; detail: DailyPlanDetail | null } | null>(null);

  const existing = planning.data?.dailyPlans.find((p) => p.planDate === date) ?? null;
  const status = existing?.status ?? null;
  const editable = existing !== null && EDITABLE.includes(status);
  const approved = status === 'APPROVED' || status === 'MANAGER_APPROVED';
  const fieldDay = existing !== null && isFieldDay(existing.workingType);
  const blocked = gate.state === 'blocked';
  const timeZone = config.data?.settings.BUSINESS_TIMEZONE;

  const selectedMonth = monthOf(date);
  const monthPlan = planning.data?.monthlyPlans.find((m) => m.planMonth === selectedMonth) ?? null;
  const monthApproved = monthPlan?.status === 'MANAGER_APPROVED' || monthPlan?.status === 'APPROVED';

  /** Everything the server knows about this plan (online only). */
  const detailKey = `${date}:${existing?.id ?? 'none'}:${status}`;
  const detail = detailState?.key === detailKey ? detailState.detail : null;
  const rejectionKey = status === 'REJECTED' ? (existing?.approvalRequestId ?? null) : null;
  const rejection = rejectionKey !== null && rejectionState?.key === rejectionKey ? rejectionState.text : null;

  // Owed doctors: the server's answer for this date when we have it, else the ones the saved plan already carries.
  const savedOwed = useMemo(() => (existing?.doctors ?? []).filter((d) => d.carriedFrom !== null), [existing]);
  const owed = owedState?.date === date ? owedState.list : savedOwed;

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
      setDoctorIds(local?.doctorIds && editable ? local.doctorIds : plannedPicks(existing));
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

  /**
   * The doctors to send, and whether they differ from the server's list. Picks off the day's routes are dropped (the server
   * refuses them); with no Field Master Data on the phone nothing is sent, so a missing cache can't wipe the saved picks.
   */
  function doctorChange(): { ids: string[]; changed: boolean } {
    const serverPicks = plannedPicks(existing);
    if (!master.data || !existing) return { ids: serverPicks, changed: false };
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
    try {
      const result = await action();
      if (result) setMsg(result);
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  const refreshAll = () => Promise.all([refreshNow(), loadDetail()]);

  const saveDoctors = () =>
    run(async () => {
      if (!online) {
        await saveLocalDraft(`daily:${date}`, { doctorIds } satisfies LocalDraft);
        return { tone: 'info', text: 'Doctors saved on this phone. Connect to the internet to send them.' };
      }
      const doctors = doctorChange();
      if (!doctors.changed) return { tone: 'info', text: 'Nothing has changed since the last save.' };
      await setDailyPlanDoctors(date, doctors.ids);
      await clearLocalDraft(`daily:${date}`);
      await refreshAll();
      return { tone: 'success', text: 'Doctors saved.' };
    });

  const submit = () => {
    if (!online) {
      Alert.alert('No connection', 'Submitting a plan needs the internet. Your doctors are kept — try again when you’re back online.');
      void saveLocalDraft(`daily:${date}`, { doctorIds } satisfies LocalDraft);
      return;
    }
    return run(async () => {
      if (!existing) return null;
      if (fieldDay) {
        const doctors = doctorChange();
        if (doctors.changed) await setDailyPlanDoctors(date, doctors.ids);
      }
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
      return { tone: 'info', text: 'Plan withdrawn. You can change the doctors and submit again.' };
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
                Working type, routes, work-with and remarks come from your approved Monthly Plan. To change them, ask your manager.
              </ThemedText>
            ) : null}
          </>
        ) : null}
      </View>

      {blocked ? <Notice tone="danger" title="Account blocked">{BLOCKED_TEXT}</Notice> : null}

      {!monthApproved && planning.loaded ? (
        <>
          <Notice tone="danger" title={`Monthly Plan for ${prettyMonth(selectedMonth)} isn’t approved`}>
            {`Your monthly plan for ${prettyMonth(selectedMonth)} isn’t approved yet. There is no daily plan, and no work, until it is.`}
          </Notice>
          <PrimaryButton label="Go to Monthly Plan" variant="text" onPress={() => router.push({ pathname: '/monthly-plan', params: selectedMonth === monthOf(today) ? { month: 'current' } : {} })} />
        </>
      ) : null}

      {monthApproved && planning.loaded && !existing ? (
        <Notice tone="warning" title={prettyDay(date)}>There is no plan for this day. Ask your manager.</Notice>
      ) : null}

      {amendment ? (
        <Notice tone="warning" title="Your manager or Admin changed this day">
          {`${formatWhen(amendment.at, timeZone)} — ${amendment.reason}`}
        </Notice>
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
        <Notice tone="info">You’re offline. You can tick doctors and keep them on this phone; saving and submitting need the internet.</Notice>
      ) : null}

      {existing && fieldDay ? (
        editable ? (
          <CardSection icon={sym('stethoscope', 'medical_services')} accent="blue" title="Doctors to call">
            <PlanDoctorsPicker routeIds={existing.routeIds} picked={doctorIds} owed={owed} onChange={setDoctorIds} disabled={busy || blocked} />
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
            {fieldDay ? <PrimaryButton label="Save doctors" variant="text" disabled={busy || blocked} onPress={saveDoctors} /> : null}
          </>
        ) : null}
        {status === 'SUBMITTED' ? <PrimaryButton label="Withdraw" variant="text" loading={busy} onPress={withdraw} /> : null}
      </View>
    </ScreenShell>
  );
}
