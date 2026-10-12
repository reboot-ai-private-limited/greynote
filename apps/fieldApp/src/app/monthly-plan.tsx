import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChoiceChips } from '@/components/choice-chips';
import { Notice } from '@/components/notice';
import { PlanDayForm } from '@/components/plan-day-form';
import { describeDay } from '@/components/plan-day-summary';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useDayGate } from '@/hooks/use-day-gate';
import { ApiError, NetworkError } from '@/lib/api';
import {
  EDITABLE,
  EMPTY_DAY,
  getMonthlyPlanDetail,
  getRejectionReason,
  saveMonthlyPlan,
  submitMonthlyPlan,
  withdrawPlan,
  type MonthlyPlanDetail,
  type PlanDay,
} from '@/lib/planning';
import { refreshNow, useColleagues, useOnline } from '@/offline';
import { useCachedSource } from '@/offline/cache';
import {
  addMonths,
  formatWhen,
  datesInMonth,
  monthlyDeadlinePassed,
  monthOf,
  nowMs,
  prettyDay,
  prettyMonth,
  weekdayOf,
  weeklyOffIndex,
} from '@/offline/day';
import { clearLocalDraft, loadLocalDraft, saveLocalDraft } from '@/offline/local-draft';
import type { ConfigSnapshot, PlanningSnapshot, TerritorySnapshot } from '@/types/sync';

type Msg = { tone: 'info' | 'warning' | 'danger' | 'success'; text: string };
type Entries = Record<string, PlanDay>;
/** The day being edited in the sheet; `ALL` fills every working day at once. */
type Editing = { date: string } | 'ALL' | null;

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

  const thisMonth = monthOf(today);
  // Opens on next month, the one planned ahead; the "isn't approved" links pass `month=current` for the month being worked now.
  const { month: startAt } = useLocalSearchParams<{ month?: string }>();
  const [month, setMonth] = useState(startAt === 'current' ? thisMonth : addMonths(thisMonth, 1));
  const [entries, setEntries] = useState<Entries>({});
  const [editing, setEditing] = useState<Editing>(null);
  const [sheet, setSheet] = useState<PlanDay>(EMPTY_DAY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  // What the server said, kept with the plan it belongs to: another month or plan reads as "not loaded yet".
  const [rejectionState, setRejectionState] = useState<{ key: string; text: string | null } | null>(null);
  const [detailState, setDetailState] = useState<{ key: string; detail: MonthlyPlanDetail | null } | null>(null);

  const existing = planning.data?.monthlyPlans.find((p) => p.planMonth === month) ?? null;
  const status = existing?.status ?? null;
  const editable = EDITABLE.includes(status);
  const offDay = weeklyOffIndex(config.data?.settings.WEEKLY_OFF_DAY);
  const days = useMemo(() => datesInMonth(month), [month]);
  const isOff = (d: string) => offDay !== null && weekdayOf(d) === offDay;
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
              { workingType: e.workingType, workWith: e.workWith, routeIds: e.routeIds, remarks: e.remarks },
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

  const cutoffDay = Number(config.data?.settings.MONTHLY_PLAN_SUBMIT_CUTOFF_DATE ?? 28);
  // The plan's own deadline when the server has given one; otherwise worked out from the cutoff setting.
  const deadlineIso = detail?.submitDeadline ?? existing?.submitDeadline ?? null;
  const deadlinePassed =
    deadlineIso !== null ? nowMs() > Date.parse(deadlineIso) : monthlyDeadlinePassed(month, today, cutoffDay);
  const resubmitUntil = detail?.resubmitAllowedUntil ?? null;
  const lateUntil = detail?.lateSubmitAllowedUntil ?? null;
  const lateButAllowed = editable && deadlinePassed && (resubmitUntil !== null || lateUntil !== null);
  const lateAndRefused = editable && deadlinePassed && !lateButAllowed;
  const planned = Object.keys(entries).length;

  function openDay(date: string) {
    setSheet(entries[date] ?? EMPTY_DAY);
    setEditing({ date });
  }

  function validDay(day: PlanDay): string | null {
    return day.workingType === 'FIELD_WORK' && day.routeIds.length === 0
      ? 'Pick at least one route for a Field Work day.'
      : null;
  }

  function applySheet() {
    const p = validDay(sheet);
    if (p) {
      Alert.alert('Almost there', p);
      return;
    }
    if (editing === 'ALL') {
      setEntries(Object.fromEntries(days.filter((d) => !isOff(d)).map((d) => [d, sheet])));
    } else if (editing) {
      setEntries((e) => ({ ...e, [editing.date]: sheet }));
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

  const list = () => Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)).map(([planDate, d]) => ({ planDate, ...d }));

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

  return (
    <ScreenShell title="Monthly Plan">
      <ChoiceChips options={monthOptions} value={month} onChange={setMonth} />
      <ThemedText type="smallBold">{prettyMonth(month)}</ThemedText>

      {status ? (
        <Notice tone={status === 'REJECTED' ? 'danger' : status === 'APPROVED' || status === 'MANAGER_APPROVED' ? 'success' : 'info'} title={STATUS_TEXT[status] ?? status}>
          {rejection ? `Reason: ${rejection}` : undefined}
        </Notice>
      ) : null}
      {editable && !deadlinePassed && deadlineIso ? (
        <Notice tone="info">{`Submit by ${formatWhen(deadlineIso, timeZone)}.`}</Notice>
      ) : null}
      {lateAndRefused ? (
        <Notice tone="warning" title="Deadline passed">
          {`This plan was due by ${deadlineIso ? formatWhen(deadlineIso, timeZone) : `day ${cutoffDay} of the month before`}. A late submit is refused unless your manager gives you an exception.`}
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
      {!online ? <Notice tone="info">You’re offline. You can plan the days and save them on this phone; submitting needs the internet.</Notice> : null}

      {editable ? (
        <PrimaryButton label="Fill every working day…" variant="text" disabled={busy} onPress={() => { setSheet(EMPTY_DAY); setEditing('ALL'); }} />
      ) : null}

      {days.map((d) => {
        const e = entries[d];
        const off = isOff(d);
        return (
          <Pressable key={d} disabled={!editable || off} onPress={() => openDay(d)} accessibilityRole="button">
            <ThemedView type="backgroundElement" style={[styles.day, off && styles.off]}>
              <ThemedText type="smallBold" style={styles.dayName}>{prettyDay(d)}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.dayText} numberOfLines={2}>
                {off ? 'Weekly off' : e ? describeDay(e, names) : editable ? 'Tap to plan' : 'Not planned'}
              </ThemedText>
            </ThemedView>
          </Pressable>
        );
      })}

      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

      <View style={{ gap: 12 }}>
        {editable ? (
          <>
            <PrimaryButton label={`Submit for approval (${planned} day${planned === 1 ? '' : 's'})`} loading={busy} onPress={submit} />
            <PrimaryButton label="Save draft" variant="text" disabled={busy} onPress={saveDraft} />
          </>
        ) : null}
        {status === 'SUBMITTED' ? <PrimaryButton label="Withdraw" variant="text" loading={busy} onPress={withdraw} /> : null}
      </View>

      <Modal visible={editing !== null} animationType="slide" onRequestClose={() => setEditing(null)}>
        <ThemedView style={styles.flex}>
          <SafeAreaView style={styles.flex}>
            <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
              <ThemedText type="subtitle" style={styles.sheetTitle}>
                {editing === 'ALL' ? 'Every working day' : editing ? prettyDay(editing.date) : ''}
              </ThemedText>
              <PlanDayForm value={sheet} onChange={setSheet} />
              <PrimaryButton label="Done" onPress={applySheet} />
              {editing && editing !== 'ALL' && entries[editing.date] ? (
                <PrimaryButton label="Clear this day" variant="text" onPress={clearDay} />
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
  day: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderRadius: Spacing.three, padding: Spacing.three },
  off: { opacity: 0.5 },
  dayName: { width: 96 },
  dayText: { flex: 1 },
  sheet: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  sheetTitle: { fontSize: 28, lineHeight: 34 },
});
