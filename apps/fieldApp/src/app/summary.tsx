import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { formatRupees } from '@/lib/money';
import { useDayGate } from '@/hooks/use-day-gate';
import { useReportSent } from '@/hooks/use-report-sent';
import { DAY_KINDS, finalSubmit, prettyDay, useOnline, useRecords, type OutboxRecord, type SyncKind } from '@/offline';
import { useCachedSource } from '@/offline/cache';
import type { FieldActivitySnapshot, FieldMasterDataSnapshot, PlanningSnapshot } from '@/types/sync';

const KIND_LABEL: Partial<Record<SyncKind, string>> = {
  DOCTOR_CALL: 'Dr call',
  CHEMIST_CALL: 'Chemist call',
  DOCTOR_FOLLOWUP: 'Dr followup',
  CHEMIST_FOLLOWUP: 'Chemist followup',
  EXPENSE: 'Expense',
};

const STATUS_TEXT: Record<OutboxRecord['status'], string> = {
  DRAFT: 'Not sent yet',
  QUEUED: 'Waiting to send',
  SYNCED: 'Sent',
  FAILED: 'Not accepted',
};

const EXPENSE_LABEL: Record<string, string> = { TRAVEL: 'Travel', MEAL: 'Meal', MISC: 'Other' };

const DCR_TEXT: Record<string, string> = {
  SUBMITTED: 'Submitted — waiting for your manager',
  MANAGER_APPROVED: 'Approved by your manager',
  APPROVED: 'Approved',
  REJECTED: 'Rejected — fix it and submit again',
  REOPENED: 'Reopened — fix it and submit again',
  WITHDRAWN: 'Withdrawn',
  DRAFT: 'Saved, not submitted',
};

type Msg = { tone: 'danger' | 'success' | 'info' | 'warning'; text: string };

/**
 * Summary & Final Submission (PRD §6.2.D): everything logged today in one place, and the button that
 * sends the day to your manager. Calls, followups and expenses are kept on the phone until now;
 * Final Submission needs the internet, sends them in order, and a record the server refuses is shown
 * here with the reason so you can fix it and submit again.
 */
export default function SummaryScreen() {
  const gate = useDayGate();
  const online = useOnline();
  const master = useCachedSource<FieldMasterDataSnapshot>('fieldMasterData');
  const activity = useCachedSource<FieldActivitySnapshot>('fieldActivity');
  const planning = useCachedSource<PlanningSnapshot>('planning');
  const { records } = useRecords(DAY_KINDS);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);

  const names = useMemo(
    () => new Map([...(master.data?.doctors ?? []), ...(master.data?.chemists ?? [])].map((o) => [o.id, o.name])),
    [master.data],
  );

  const today = gate.today;
  const dayRecords = records.filter(
    (r) => !r.deleted && DAY_KINDS.includes(r.kind) && (r.payload as { reportDate?: string }).reportDate === today,
  );
  const dcr = activity.data?.dcrs?.find((d) => d.reportDate === today) ?? null;
  const alreadySent = useReportSent(today);

  const failed = dayRecords.filter((r) => r.status === 'FAILED');

  const plan = planning.data?.dailyPlans.find((p) => p.planDate === today) ?? null;
  const plannedDoctorIds = useMemo(() => new Set((plan?.doctors ?? []).map((d) => d.doctorId)), [plan]);
  const hasPlannedDoctors = (plan?.doctors?.length ?? 0) > 0;

  const describe = (r: OutboxRecord) => {
    const p = r.payload as { doctorId?: string; chemistId?: string; type?: string; amountPaise?: number };
    const who = names.get(p.doctorId ?? p.chemistId ?? '');
    if (r.kind === 'EXPENSE') return `${EXPENSE_LABEL[p.type ?? ''] ?? 'Expense'} · ${formatRupees(p.amountPaise ?? 0)}`;
    const notInPlan = r.kind === 'DOCTOR_CALL' && Boolean(p.doctorId) && hasPlannedDoctors && !plannedDoctorIds.has(p.doctorId!);
    const label = who ?? (p.doctorId ? 'Doctor (no longer active)' : p.chemistId ? 'Chemist (no longer active)' : 'Record');
    return notInPlan ? `${label} (Not in plan)` : label;
  };

  const submit = async () => {
    setBusy(true);
    setMsg({ tone: 'info', text: 'Sending today’s report…' });
    try {
      const result = await finalSubmit(today);
      if (result.offline) {
        setMsg({ tone: 'warning', text: 'The connection dropped. Nothing was lost — your report stays on this phone. Try again when you are online.' });
      } else if (result.submit?.status === 'SYNCED') {
        setMsg({ tone: 'success', text: 'Today’s report is submitted. Your manager will review it.' });
      } else if (result.submit?.errorMessage) {
        setMsg({ tone: 'danger', text: result.submit.errorMessage });
      } else if (result.failed > 0 || result.held > 0) {
        setMsg({ tone: 'danger', text: 'Some records were not accepted. Fix them below and submit again.' });
      } else {
        setMsg({ tone: 'danger', text: result.error ?? 'The report could not be submitted. Try again.' });
      }
    } catch (err) {
      setMsg({ tone: 'danger', text: err instanceof Error ? err.message : 'Could not submit the report.' });
    } finally {
      setBusy(false);
    }
  };

  const blocked = gate.state === 'blocked';
  // Today's plan must be approved (gate open), and nothing the server refused may be left: fix those first.
  const canSubmit = online && gate.state === 'open' && !alreadySent && failed.length === 0;

  return (
    <ScreenShell title="Summary">
      <ThemedText themeColor="textSecondary">{prettyDay(today)}</ThemedText>

      {blocked || gate.state === 'unknown' ? <Notice tone="warning">{gate.reason ?? ''}</Notice> : null}
      {gate.state === 'closed' ? (
        <>
          <Notice tone="warning" title={gate.cause === 'MONTHLY_PLAN' ? 'Monthly plan not approved' : 'Today’s plan isn’t approved'}>
            {gate.reason ?? ''}
          </Notice>
          {gate.cause === 'MONTHLY_PLAN' ? (
            <PrimaryButton label="Go to Monthly Plan" variant="text" onPress={() => router.push({ pathname: '/monthly-plan', params: { month: 'current' } })} />
          ) : null}
        </>
      ) : null}
      {dcr ? <Notice tone={dcr.status === 'REJECTED' ? 'danger' : 'info'} title="Today’s report">{DCR_TEXT[dcr.status] ?? dcr.status}</Notice> : null}
      {!online ? <Notice tone="info">You’re offline. Your report is kept on this phone; Final Submission needs the internet.</Notice> : null}
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">{`Logged today · ${dayRecords.length}`}</ThemedText>
        {dayRecords.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            Nothing logged yet. Add calls, followups or expenses from Home.
          </ThemedText>
        ) : (
          dayRecords.map((r) => (
            <ThemedView key={r.clientId} style={styles.row}>
              <ThemedText type="small">{`${KIND_LABEL[r.kind] ?? r.kind} · ${describe(r)}`}</ThemedText>
              <ThemedText type="small" themeColor={r.status === 'FAILED' ? 'danger' : 'textSecondary'}>
                {STATUS_TEXT[r.status]}
              </ThemedText>
              {r.status === 'FAILED' && r.errorMessage ? (
                <ThemedText type="small" themeColor="danger">
                  {r.errorMessage}
                </ThemedText>
              ) : null}
            </ThemedView>
          ))
        )}
      </ThemedView>

      {failed.length > 0 ? (
        <Notice tone="danger" title="Fix before submitting">
          {'Open the screen for each record marked “Not accepted”, correct it, and submit again.'}
        </Notice>
      ) : null}

      {alreadySent ? null : (
        <PrimaryButton
          label={dayRecords.length === 0 ? 'Submit today’s report (nothing logged)' : 'Final Submission'}
          loading={busy}
          disabled={!canSubmit}
          onPress={submit}
        />
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  row: { gap: Spacing.half, backgroundColor: 'transparent' },
});
