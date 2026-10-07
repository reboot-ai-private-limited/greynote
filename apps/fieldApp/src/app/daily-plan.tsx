import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { Notice } from '@/components/notice';
import { PlanDayForm } from '@/components/plan-day-form';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { useDayGate } from '@/hooks/use-day-gate';
import { ApiError, NetworkError } from '@/lib/api';
import {
  EDITABLE,
  EMPTY_DAY,
  getRejectionReason,
  requestDailyPlanChange,
  saveDailyPlan,
  submitDailyPlan,
  withdrawPlan,
  workingTypeLabel,
  type PlanDay,
} from '@/lib/planning';
import { refreshNow, useOnline } from '@/offline';
import { useCachedSource } from '@/offline/cache';
import { addDays, businessNowHHmm, dailyDeadlinePassed, prettyDay } from '@/offline/day';
import { clearLocalDraft, loadLocalDraft, saveLocalDraft } from '@/offline/local-draft';
import type { ConfigSnapshot, PlanningSnapshot } from '@/types/sync';

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

const errorText = (err: unknown) =>
  err instanceof ApiError || err instanceof NetworkError ? err.message : 'Something went wrong. Please try again.';

/**
 * Daily Plan (PRD §6.2.A): pick the day, the working type and routes, then submit for the
 * manager's approval. Save and Submit need a connection (LLD/planning.md); offline, the form is
 * kept on the phone and sent later. An approved plan can't be edited, only changed on its own
 * day by a change request the manager approves.
 */
export default function DailyPlanScreen() {
  const planning = useCachedSource<PlanningSnapshot>('planning');
  const config = useCachedSource<ConfigSnapshot>('config');
  const { today } = useDayGate();
  const online = useOnline();

  const [date, setDate] = useState(today);
  const [day, setDay] = useState<PlanDay>(EMPTY_DAY);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [rejection, setRejection] = useState<string | null>(null);

  const existing = planning.data?.dailyPlans.find((p) => p.planDate === date) ?? null;
  const status = existing?.status ?? null;
  const editable = EDITABLE.includes(status);
  const approved = status === 'APPROVED' || status === 'MANAGER_APPROVED';
  const canRequestChange = approved && date === today;

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
    setRejection(null);
    if (status === 'REJECTED' && existing?.approvalRequestId && online) {
      getRejectionReason(existing.approvalRequestId).then(setRejection).catch(() => undefined);
    }
  }, [status, existing?.approvalRequestId, online]);

  const dateOptions = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const d = addDays(today, i);
        return { value: d, label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : prettyDay(d) };
      }),
    [today],
  );

  const cutoff = config.data?.settings.DAILY_PLAN_SUBMIT_CUTOFF_TIME ?? '10:00';
  const late =
    editable && dailyDeadlinePassed(date, today, businessNowHHmm(config.data?.settings.BUSINESS_TIMEZONE), cutoff);

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
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  const saveDraft = () =>
    run(async () => {
      const p = problem();
      if (p) return { tone: 'warning', text: p };
      if (!online) {
        await saveLocalDraft(`daily:${date}`, day);
        return { tone: 'info', text: 'Saved on this phone. Connect to the internet to submit it.' };
      }
      await saveDailyPlan(date, day);
      await clearLocalDraft(`daily:${date}`);
      await refreshNow();
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
      const saved = await saveDailyPlan(date, day);
      await submitDailyPlan(saved.id);
      await clearLocalDraft(`daily:${date}`);
      await refreshNow();
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
      if (!reason.trim()) return { tone: 'warning', text: 'Tell your manager why the plan is changing.' };
      await requestDailyPlanChange(existing.id, day, reason.trim());
      await refreshNow();
      setReason('');
      return { tone: 'success', text: 'Change request sent to your manager. Today’s approved plan stays in force until they decide.' };
    });

  const withdraw = () =>
    run(async () => {
      if (!existing?.approvalRequestId) return null;
      if (!online) return { tone: 'warning', text: 'Connect to the internet to withdraw.' };
      await withdrawPlan(existing.approvalRequestId);
      await refreshNow();
      return { tone: 'info', text: 'Plan withdrawn. You can edit it and submit again.' };
    });

  return (
    <ScreenShell title="Daily Plan">
      <ThemedText type="smallBold">Date</ThemedText>
      <ChoiceChips options={dateOptions} value={date} onChange={setDate} />

      {status ? (
        <Notice tone={status === 'REJECTED' ? 'danger' : approved ? 'success' : 'info'} title={`${prettyDay(date)}: ${STATUS_TEXT[status] ?? status}`}>
          {rejection ? `Reason: ${rejection}` : approved && !canRequestChange ? 'This plan is approved and can’t be edited.' : undefined}
        </Notice>
      ) : null}

      {late ? (
        <Notice tone="warning" title="Deadline passed">
          {`Daily Plans are due by ${cutoff} on the day. A late submit is refused unless your manager gives you an exception.`}
        </Notice>
      ) : null}

      {!online ? (
        <Notice tone="info">You’re offline. You can fill the form and save it on this phone; submitting needs the internet.</Notice>
      ) : null}

      {editable || canRequestChange ? (
        <>
          <PlanDayForm value={day} onChange={setDay} disabled={busy} />

          {canRequestChange ? (
            <>
              <Notice tone="info">
                {`Today’s plan is approved (${workingTypeLabel(existing!.workingType)}). To change it, send a request — your manager decides.`}
              </Notice>
              <TextField label="Why is the plan changing?" value={reason} onChangeText={setReason} multiline editable={!busy} />
            </>
          ) : null}
        </>
      ) : existing ? (
        <ThemedText type="small" themeColor="textSecondary">
          {`${workingTypeLabel(existing.workingType)}${existing.remarks ? ` — ${existing.remarks}` : ''}`}
        </ThemedText>
      ) : null}

      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

      <View style={{ gap: 12 }}>
        {editable ? (
          <>
            <PrimaryButton label="Submit for approval" loading={busy} onPress={submit} />
            <PrimaryButton label="Save draft" variant="text" disabled={busy} onPress={saveDraft} />
          </>
        ) : null}
        {canRequestChange ? <PrimaryButton label="Send change request" loading={busy} onPress={sendChange} /> : null}
        {status === 'SUBMITTED' ? <PrimaryButton label="Withdraw" variant="text" loading={busy} onPress={withdraw} /> : null}
      </View>
    </ScreenShell>
  );
}
