import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { Notice } from '@/components/notice';
import { PlanDayForm } from '@/components/plan-day-form';
import { describeDay, PlanDaySummary } from '@/components/plan-day-summary';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { useDayGate } from '@/hooks/use-day-gate';
import { ApiError, NetworkError } from '@/lib/api';
import {
  EDITABLE,
  EMPTY_DAY,
  getDailyPlanDetail,
  getRejectionReason,
  listDailyPlanChanges,
  requestDailyPlanChange,
  saveDailyPlan,
  submitDailyPlan,
  withdrawPlan,
  type DailyPlanChange,
  type DailyPlanDetail,
  type PlanDay,
} from '@/lib/planning';
import { refreshNow, useColleagues, useOnline } from '@/offline';
import { useCachedSource } from '@/offline/cache';
import { addDays, businessNowHHmm, dailyDeadlinePassed, formatWhen, nowMs, prettyDay } from '@/offline/day';
import { clearLocalDraft, loadLocalDraft, saveLocalDraft } from '@/offline/local-draft';
import type { ConfigSnapshot, PlanningSnapshot, TerritorySnapshot } from '@/types/sync';

type Msg = { tone: 'info' | 'warning' | 'danger' | 'success'; text: string };

const STATUS_TEXT: Record<string, string> = {
  DRAFT: 'Saved, not submitted yet',
  SUBMITTED: 'Waiting for your manager’s approval',
  MANAGER_APPROVED: 'Approved by your manager',
  APPROVED: 'Approved',
  REJECTED: 'Rejected by your manager — update it and submit again',
  WITHDRAWN: 'Withdrawn — submit it again when ready',
  REOPENED: 'Reopened by Admin — update it and submit again',
};

const CHANGE_TEXT: Record<string, { title: string; tone: Msg['tone'] }> = {
  SUBMITTED: { title: 'Waiting for your manager’s decision', tone: 'info' },
  MANAGER_APPROVED: { title: 'Waiting for your manager’s decision', tone: 'info' },
  APPROVED: { title: 'Approved — your plan was updated', tone: 'success' },
  REJECTED: { title: 'Rejected — your plan stays as it was', tone: 'danger' },
  WITHDRAWN: { title: 'Withdrawn', tone: 'info' },
};

/** Whether the form still equals what the server has — then there is nothing to save, and (for an inherited day) nothing the server would accept. */
function sameDay(a: PlanDay, b: PlanDay): boolean {
  const key = (d: PlanDay) =>
    JSON.stringify([d.workingType, [...d.routeIds].sort(), [...d.workWith].sort(), (d.remarks ?? '').trim()]);
  return key(a) === key(b);
}

const errorText = (err: unknown) =>
  err instanceof ApiError || err instanceof NetworkError ? err.message : 'Something went wrong. Please try again.';

/**
 * Daily Plan (PRD §6.2.A): pick the day, the working type, routes and who you work with, then submit
 * for the manager's approval. Save and Submit need a connection (LLD/planning.md); offline, the form
 * is kept on the phone and sent later.
 *
 * Everything the server knows about the plan is shown: the plan's own deadline, the resubmit window
 * after a rejection, a late-submission exception, a day inherited from the Monthly Plan (read-only —
 * submit it as it is), a manager's amendment, and the in-day change requests with their status.
 */
export default function DailyPlanScreen() {
  const planning = useCachedSource<PlanningSnapshot>('planning');
  const config = useCachedSource<ConfigSnapshot>('config');
  const territory = useCachedSource<TerritorySnapshot>('territory');
  const { colleagues } = useColleagues();
  const { today } = useDayGate();
  const online = useOnline();

  const [date, setDate] = useState(today);
  const [day, setDay] = useState<PlanDay>(EMPTY_DAY);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  // What the server said, kept with the plan it belongs to: a different day or plan reads as "not loaded yet".
  const [rejectionState, setRejectionState] = useState<{ key: string; text: string | null } | null>(null);
  const [detailState, setDetailState] = useState<{ key: string; detail: DailyPlanDetail | null; changes: DailyPlanChange[] } | null>(null);
  // A day the server refused to re-save because it comes from the approved Monthly Plan.
  const [refusedAsInherited, setRefusedAsInherited] = useState<Record<string, boolean>>({});

  const existing = planning.data?.dailyPlans.find((p) => p.planDate === date) ?? null;
  const status = existing?.status ?? null;
  const editable = EDITABLE.includes(status);
  const approved = status === 'APPROVED' || status === 'MANAGER_APPROVED';
  const timeZone = config.data?.settings.BUSINESS_TIMEZONE;

  /** Everything the server knows about this plan (online only). */
  const detailKey = `${date}:${existing?.id ?? 'new'}:${status}`;
  const detail = detailState?.key === detailKey ? detailState.detail : null;
  const changes = detailState?.key === detailKey ? detailState.changes : [];
  const rejectionKey = status === 'REJECTED' ? (existing?.approvalRequestId ?? null) : null;
  const rejection = rejectionKey !== null && rejectionState?.key === rejectionKey ? rejectionState.text : null;

  const inherited = detail?.source === 'MONTHLY' || refusedAsInherited[date] === true;
  const openChange = changes.find((c) => c.open) ?? null;
  const canRequestChange = approved && date === today && !openChange;

  const names = useMemo(
    () => ({
      routes: new Map((territory.data?.routes ?? []).map((r) => [r.id, r.name])),
      colleagues: new Map(colleagues.map((c) => [c.id, c])),
    }),
    [territory.data, colleagues],
  );

  /** Asks the server for the full plan and its change requests; `null` offline or on a failure. */
  const fetchDetail = useCallback(async () => {
    if (!online) return null;
    try {
      const d = await getDailyPlanDetail(date);
      return { key: detailKey, detail: d, changes: d ? await listDailyPlanChanges(d.id) : [] };
    } catch {
      return null; // Keep what the phone already has; the snapshot is enough to work from.
    }
  }, [date, online, detailKey]);
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

  // Load the form when the day (or the plan behind it) changes — not on every refresh, which
  // would wipe what the MR is typing.
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!planning.loaded) return;
    const key = `${date}:${existing?.id ?? 'new'}`;
    if (loadedFor.current === key) return;
    loadedFor.current = key;
    setMsg(null);
    setReason('');
    void loadLocalDraft<PlanDay>(`daily:${date}`).then((local) => {
      if (local && editable) setDay(local);
      else if (existing) {
        setDay({ workingType: existing.workingType, workWith: existing.workWith, routeIds: existing.routeIds, remarks: existing.remarks });
      } else setDay(EMPTY_DAY);
    });
  }, [planning.loaded, date, existing, editable]);

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

  // The plan's own deadline when the server has given one; otherwise worked out from the cutoff setting.
  const cutoff = config.data?.settings.DAILY_PLAN_SUBMIT_CUTOFF_TIME ?? '10:00';
  const deadlineIso = detail?.submitDeadline ?? existing?.submitDeadline ?? null;
  const deadlinePassed =
    deadlineIso !== null
      ? nowMs() > Date.parse(deadlineIso)
      : dailyDeadlinePassed(date, today, businessNowHHmm(timeZone), cutoff);
  const resubmitUntil = detail?.resubmitAllowedUntil ?? null;
  const lateUntil = detail?.lateSubmitAllowedUntil ?? null;
  const lateButAllowed = editable && deadlinePassed && (resubmitUntil !== null || lateUntil !== null);
  const lateAndRefused = editable && deadlinePassed && !lateButAllowed;
  const amendment = detail?.amendments?.length ? detail.amendments[detail.amendments.length - 1]! : null;

  function problem(): string | null {
    if (day.workingType === 'FIELD_WORK' && day.routeIds.length === 0) return 'Pick at least one route for a Field Work day.';
    return null;
  }

  async function run(action: () => Promise<Msg | null>) {
    setBusy(true);
    setMsg(null);
    try {
      const result = await action();
      if (result) setMsg(result);
    } catch (err) {
      if (err instanceof ApiError && err.data?.reason === 'PLAN_INHERITED_READONLY' && existing) {
        setRefusedAsInherited((i) => ({ ...i, [date]: true }));
        setDay({ workingType: existing.workingType, workWith: existing.workWith, routeIds: existing.routeIds, remarks: existing.remarks });
      }
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  const refreshAll = () => Promise.all([refreshNow(), loadDetail()]);

  const saveDraft = () =>
    run(async () => {
      const p = problem();
      if (p) return { tone: 'warning', text: p };
      if (!online) {
        await saveLocalDraft(`daily:${date}`, day);
        return { tone: 'info', text: 'Saved on this phone. Connect to the internet to submit it.' };
      }
      if (existing && sameDay(day, existing)) return { tone: 'info', text: 'Nothing has changed since the last save.' };
      await saveDailyPlan(date, day);
      await clearLocalDraft(`daily:${date}`);
      await refreshAll();
      return { tone: 'success', text: 'Draft saved.' };
    });

  const submit = () => {
    if (!online) {
      Alert.alert('No connection', 'Submitting a plan needs the internet. Your form is kept — try again when you’re back online.');
      void saveLocalDraft(`daily:${date}`, day);
      return;
    }
    return run(async () => {
      const p = problem();
      if (p) return { tone: 'warning', text: p };
      // Save only what the MR changed: an unchanged plan is submitted as it is — the only way to send a
      // day inherited from the approved Monthly Plan, which the server won't let them re-save.
      const planId = existing && sameDay(day, existing) ? existing.id : (await saveDailyPlan(date, day)).id;
      await submitDailyPlan(planId);
      await clearLocalDraft(`daily:${date}`);
      await refreshAll();
      Alert.alert('Plan submitted', 'Your manager will be asked to approve it.', [{ text: 'OK', onPress: () => router.back() }]);
      return null;
    });
  };

  const sendChange = () =>
    run(async () => {
      if (!online) return { tone: 'warning', text: 'Connect to the internet to send a change request.' };
      if (!existing) return null;
      const p = problem();
      if (p) return { tone: 'warning', text: p };
      if (sameDay(day, existing)) return { tone: 'warning', text: 'That is the same as your approved plan. Change something first.' };
      if (!reason.trim()) return { tone: 'warning', text: 'Tell your manager why the plan is changing.' };
      await requestDailyPlanChange(existing.id, day, reason.trim());
      await refreshAll();
      setReason('');
      return { tone: 'success', text: 'Change request sent to your manager. Today’s approved plan stays in force until they decide.' };
    });

  const withdraw = () =>
    run(async () => {
      if (!existing?.approvalRequestId) return null;
      if (!online) return { tone: 'warning', text: 'Connect to the internet to withdraw.' };
      await withdrawPlan(existing.approvalRequestId);
      await refreshAll();
      return { tone: 'info', text: 'Plan withdrawn. You can edit it and submit again.' };
    });

  const withdrawChange = (requestId: string) =>
    run(async () => {
      if (!online) return { tone: 'warning', text: 'Connect to the internet to withdraw.' };
      await withdrawPlan(requestId);
      await refreshAll();
      return { tone: 'info', text: 'Change request withdrawn. Your approved plan is unchanged.' };
    });

  return (
    <ScreenShell title="Daily Plan">
      <ThemedText type="smallBold">Date</ThemedText>
      <ChoiceChips options={dateOptions} value={date} onChange={setDate} />

      {status ? (
        <Notice tone={status === 'REJECTED' ? 'danger' : approved ? 'success' : 'info'} title={`${prettyDay(date)}: ${STATUS_TEXT[status] ?? status}`}>
          {rejection ? `Reason: ${rejection}` : approved && !canRequestChange && !openChange ? 'This plan is approved and can’t be edited.' : undefined}
        </Notice>
      ) : null}

      {inherited && editable ? (
        <Notice tone="info" title="From your approved Monthly Plan">
          This day was filled in from your Monthly Plan, so it can’t be edited here. Submit it as it is, or ask your manager to amend it.
        </Notice>
      ) : null}

      {amendment ? (
        <Notice tone="warning" title="Your manager or Admin changed this day">
          {`${formatWhen(amendment.at, timeZone)} — ${amendment.reason}`}
        </Notice>
      ) : null}

      {editable && !deadlinePassed && deadlineIso ? (
        <Notice tone="info">{`Submit by ${formatWhen(deadlineIso, timeZone)}.`}</Notice>
      ) : null}
      {lateAndRefused ? (
        <Notice tone="warning" title="Deadline passed">
          {`This plan was due by ${deadlineIso ? formatWhen(deadlineIso, timeZone) : cutoff}. A late submit is refused unless your manager gives you an exception.`}
        </Notice>
      ) : null}
      {lateButAllowed && resubmitUntil ? (
        <Notice tone="warning" title="You can still resubmit">
          {`Because it was rejected, you may resubmit until ${formatWhen(resubmitUntil, timeZone)}.`}
        </Notice>
      ) : null}
      {lateButAllowed && !resubmitUntil && lateUntil ? (
        <Notice tone="warning" title="Late-submission exception">
          {`Your manager allowed a late submit. It expires ${formatWhen(lateUntil, timeZone)}.`}
        </Notice>
      ) : null}

      {!online ? (
        <Notice tone="info">You’re offline. You can fill the form and save it on this phone; submitting needs the internet.</Notice>
      ) : null}

      {editable || canRequestChange ? (
        <>
          <PlanDayForm value={day} onChange={setDay} disabled={busy || (inherited && editable)} />

          {canRequestChange ? (
            <>
              <Notice tone="info">
                {`Today’s plan is approved (${describeDay(existing!, names)}). To change it, send a request — your manager decides.`}
              </Notice>
              <TextField label="Why is the plan changing?" value={reason} onChangeText={setReason} multiline maxLength={500} editable={!busy} />
            </>
          ) : null}
        </>
      ) : existing ? (
        <PlanDaySummary text={describeDay(existing, names)} />
      ) : null}

      {changes.slice(0, 3).map((c) => {
        const t = CHANGE_TEXT[c.status] ?? { title: c.status, tone: 'info' as const };
        return (
          <Notice key={c.id} tone={t.tone} title={`Change request · ${formatWhen(c.createdAt, timeZone)}`}>
            {`${t.title}\nTo: ${describeDay(c.proposed, names)}\nWhy: ${c.reason}`}
          </Notice>
        );
      })}
      {openChange?.approval ? (
        <PrimaryButton label="Withdraw change request" variant="text" loading={busy} onPress={() => withdrawChange(openChange.approval!.requestId)} />
      ) : null}

      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

      <View style={{ gap: 12 }}>
        {editable ? (
          <>
            <PrimaryButton label="Submit for approval" loading={busy} onPress={submit} />
            {!(inherited && editable) ? <PrimaryButton label="Save draft" variant="text" disabled={busy} onPress={saveDraft} /> : null}
          </>
        ) : null}
        {canRequestChange ? <PrimaryButton label="Send change request" loading={busy} onPress={sendChange} /> : null}
        {status === 'SUBMITTED' ? <PrimaryButton label="Withdraw" variant="text" loading={busy} onPress={withdraw} /> : null}
      </View>
    </ScreenShell>
  );
}
