import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Notice } from '@/components/notice';
import { OutletPicker } from '@/components/outlet-picker';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useDayGate } from '@/hooks/use-day-gate';
import { useReportSent } from '@/hooks/use-report-sent';
import { confirmRemove, removeDayRecord } from '@/lib/day-records';
import { captureLocation } from '@/lib/location';
import { isFieldDay, routeTypeLabel, workingTypeLabel } from '@/lib/planning';
import { notAtLocationReason, saveCall, useOnline, useRecords, type FollowupPayload, type OutboxRecord } from '@/offline';
import { useCachedSource } from '@/offline/cache';
import type { FieldMasterDataSnapshot, PlanningSnapshot, TerritorySnapshot } from '@/types/sync';

type Subject = 'DOCTOR' | 'CHEMIST';

const MAX_REMARKS = 1000;

const STATUS_TEXT: Record<OutboxRecord['status'], string> = {
  DRAFT: 'Saved on this phone',
  QUEUED: 'Ready to send',
  SYNCED: 'Sent',
  FAILED: 'Not accepted',
};

/**
 * Dr / Chemist Followup (PRD §6.2.C, docs/mobile/dcr.md): a note on someone you've met, added to today's report. Remarks are
 * required. Kept on the phone and sent with Final Submission, so it works offline. The same location rule as a call: the
 * phone's GPS goes with it and it is only saved at the doctor's or chemist's place. Follow-ups exist only on Field Work and
 * Doctor Campaign days; one off the day's plan is saved and flagged.
 */
export function FollowupScreen({ subject }: { subject: Subject }) {
  const isDoctor = subject === 'DOCTOR';
  const kind = isDoctor ? 'DOCTOR_FOLLOWUP' : 'CHEMIST_FOLLOWUP';
  const noun = isDoctor ? 'doctor' : 'chemist';
  const title = isDoctor ? 'Dr Followup' : 'Chemist Followup';

  const gate = useDayGate();
  const online = useOnline();
  const reportSent = useReportSent(gate.today);
  const master = useCachedSource<FieldMasterDataSnapshot>('fieldMasterData');
  const planning = useCachedSource<PlanningSnapshot>('planning');
  const territory = useCachedSource<TerritorySnapshot>('territory');
  const { records } = useRecords([kind]);

  const [editing, setEditing] = useState<OutboxRecord | 'new' | null>(null);
  const [outletId, setOutletId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success' | 'info'; text: string } | null>(null);

  const plan = planning.data?.dailyPlans.find((p) => p.planDate === gate.today) ?? null;
  const fieldDay = plan ? isFieldDay(plan.workingType) : true;
  const plannedRoutes = useMemo(() => new Set(plan?.routeIds ?? []), [plan]);
  const plannedDoctorIds = useMemo(() => new Set((plan?.doctors ?? []).map((d) => d.doctorId)), [plan]);
  const hasPlannedDoctors = plannedDoctorIds.size > 0;

  /** The server's `notInPlan`: a doctor not on the day's list, or a chemist whose route the plan doesn't list. */
  const notInPlan = (o: { id: string; routeId: string }) =>
    isDoctor ? (hasPlannedDoctors ? !plannedDoctorIds.has(o.id) : !plannedRoutes.has(o.routeId)) : !plannedRoutes.has(o.routeId);

  const idOf = (r: OutboxRecord) => {
    const p = r.payload as FollowupPayload;
    return (isDoctor ? p.doctorId : p.chemistId) ?? '';
  };

  const outlets = useMemo(() => {
    const list: { id: string; routeId: string; name: string; address: string; location: { latitude: number; longitude: number } | null; specialty?: string }[] =
      isDoctor ? (master.data?.doctors ?? []) : (master.data?.chemists ?? []);
    return [...list].sort((a, b) => Number(notInPlan(a)) - Number(notInPlan(b)) || a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [master.data, isDoctor, plannedRoutes, plannedDoctorIds]);
  const byId = useMemo(() => new Map(outlets.map((o) => [o.id, o])), [outlets]);
  const routeTypeOf = (routeId: string | undefined) => routeTypeLabel(territory.data?.routes.find((r) => r.id === routeId)?.routeType);
  const todays = records.filter((r) => !r.deleted && (r.payload as FollowupPayload).reportDate === gate.today);

  const start = (record: OutboxRecord | 'new') => {
    setMsg(null);
    if (record === 'new') {
      setOutletId(null);
      setRemarks('');
    } else {
      setOutletId(idOf(record));
      setRemarks((record.payload as FollowupPayload).remarks);
    }
    setEditing(record);
  };

  const save = async () => {
    if (!outletId) {
      setMsg({ tone: 'danger', text: `Choose the ${noun}.` });
      return;
    }
    if (!remarks.trim()) {
      setMsg({ tone: 'danger', text: 'Write what the followup is about.' });
      return;
    }
    setBusy(true);
    setMsg({ tone: 'info', text: 'Getting your location…' });
    try {
      const fix = await captureLocation();
      const away = await notAtLocationReason(byId.get(outletId)?.location ?? null, fix, noun);
      if (away) {
        setMsg({ tone: 'danger', text: away });
        return;
      }
      const payload: FollowupPayload = {
        reportDate: gate.today,
        ...(isDoctor ? { doctorId: outletId } : { chemistId: outletId }),
        remarks: remarks.trim(),
        capturedLocation: fix?.point ?? null,
        accuracyMeters: fix?.accuracyMeters ?? null,
      };
      await saveCall(kind, payload, editing && editing !== 'new' ? editing : undefined);
      setEditing(null);
      setMsg({ tone: 'success', text: 'Followup saved with your location. It goes up with Final Submission.' });
    } catch (err) {
      setMsg({ tone: 'danger', text: err instanceof Error ? err.message : 'Could not save the followup.' });
    } finally {
      setBusy(false);
    }
  };

  const remove = (r: OutboxRecord) =>
    confirmRemove('follow-up', async () => {
      if (r.status === 'SYNCED' && !online) {
        setMsg({ tone: 'danger', text: 'Removing a followup that was already sent needs the internet.' });
        return;
      }
      try {
        await removeDayRecord(r);
        setMsg({ tone: 'info', text: 'Followup removed.' });
      } catch (err) {
        setMsg({ tone: 'danger', text: err instanceof Error ? err.message : 'Could not remove it.' });
      }
    });

  if (gate.state !== 'open') {
    return (
      <ScreenShell title={title}>
        <Notice tone="warning" title={gate.cause === 'MONTHLY_PLAN' ? 'Monthly plan not approved' : 'Not available right now'}>
          {gate.reason ?? 'Followups open once today’s Tour Plan is approved.'}
        </Notice>
        {gate.cause === 'MONTHLY_PLAN' ? (
          <PrimaryButton label="Go to Monthly Plan" variant="text" onPress={() => router.push({ pathname: '/monthly-plan', params: { month: 'current' } })} />
        ) : null}
      </ScreenShell>
    );
  }

  if (!fieldDay && plan) {
    return (
      <ScreenShell title={title}>
        <Notice tone="info" title={`Today is a ${workingTypeLabel(plan.workingType)} day`}>
          {`There are no followups on a ${workingTypeLabel(plan.workingType)} day. Write your note for the day on Summary & Submit and send the daily report from there.`}
        </Notice>
        <PrimaryButton label="Go to Summary & Submit" variant="text" onPress={() => router.push('/summary')} />
      </ScreenShell>
    );
  }

  if (editing) {
    const picked = outletId ? byId.get(outletId) : undefined;
    return (
      <ScreenShell title={editing === 'new' ? `New ${title}` : `Edit ${title}`}>
        <OutletPicker
          label={isDoctor ? 'Doctor' : 'Chemist'}
          options={outlets.map((o) => ({
            id: o.id,
            name: o.name,
            subtitle: `${notInPlan(o) ? 'Not in plan · ' : ''}${o.specialty ? `${o.specialty} · ${o.address}` : o.address}`,
          }))}
          value={outletId}
          onChange={(id) => {
            setOutletId(id);
            setMsg(null);
          }}
          disabled={busy}
          emptyText={`No ${noun}s yet. Connect to the internet once so your list can load.`}
        />
        {picked && notInPlan(picked) ? (
          <Notice tone="warning" title="Not in your plan">Not in today’s plan: the followup is still saved, and marked that way for your manager.</Notice>
        ) : null}
        {picked && !picked.location ? (
          <Notice tone="warning">{`This ${noun} has no registered location, so a followup can’t be saved yet. Ask Admin to set it.`}</Notice>
        ) : null}
        <TextField
          label="Remarks"
          value={remarks}
          onChangeText={(t) => {
            setRemarks(t);
            setMsg(null);
          }}
          multiline
          maxLength={MAX_REMARKS}
          editable={!busy}
          placeholder="What needs following up?"
        />
        <ThemedText type="small" themeColor="textSecondary">
          {`You must be at the ${noun}’s place — your location is checked when you save.`}
        </ThemedText>
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <PrimaryButton label="Save followup" loading={busy} onPress={save} />
        <PrimaryButton label="Cancel" variant="text" disabled={busy} onPress={() => setEditing(null)} />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title={title}>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      {reportSent ? (
        <Notice tone="info" title="Today’s report is submitted">
          It can’t take more followups unless your manager sends it back.
        </Notice>
      ) : (
        <PrimaryButton label={`Add a ${title}`} onPress={() => start('new')} />
      )}

      {todays.length === 0 ? (
        <Notice tone="info">{`No ${noun} followups today.`}</Notice>
      ) : (
        todays.map((r) => {
          const editable = r.status === 'DRAFT' || r.status === 'FAILED';
          const removable = editable || (r.status === 'SYNCED' && !reportSent);
          const who = byId.get(idOf(r));
          return (
            <ThemedView key={r.clientId} type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">{who?.name ?? `Unknown ${noun}`}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {[plan ? workingTypeLabel(plan.workingType) : null, routeTypeOf(who?.routeId), STATUS_TEXT[r.status]].filter(Boolean).join(' · ')}
              </ThemedText>
              {who && notInPlan(who) ? (
                <ThemedText type="small" themeColor="warning">
                  Not in plan
                </ThemedText>
              ) : null}
              <ThemedText type="small">{(r.payload as FollowupPayload).remarks}</ThemedText>
              {r.status === 'FAILED' && r.errorMessage ? (
                <ThemedText type="small" themeColor="danger">
                  {r.errorMessage}
                </ThemedText>
              ) : null}
              {r.status === 'FAILED' && r.errorCode === 'NOT_AT_LOCATION' ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Refused for its location — remove it, go to the place and add it again.
                </ThemedText>
              ) : null}
              {removable ? (
                <View style={styles.actions}>
                  {editable && r.errorCode !== 'NOT_AT_LOCATION' ? <PrimaryButton label="Edit" variant="text" onPress={() => start(r)} /> : null}
                  <PrimaryButton label="Remove" variant="text" onPress={() => remove(r)} />
                </View>
              ) : null}
            </ThemedView>
          );
        })
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
  actions: { flexDirection: 'row', gap: Spacing.two },
});
