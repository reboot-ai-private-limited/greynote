import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FormField } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { OutletPicker } from '@/components/outlet-picker';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { CardSection, IconChip, InfoCard, Pill, sym } from '@/components/ui-cards';
import { Spacing } from '@/constants/theme';
import { useDayGate } from '@/hooks/use-day-gate';
import { useDoctorVisitGap } from '@/hooks/use-doctor-visit-gap';
import { useFormErrors } from '@/hooks/use-form-errors';
import { useReportSent } from '@/hooks/use-report-sent';
import { confirmRemove, removeDayRecord } from '@/lib/day-records';
import { captureLocation } from '@/lib/location';
import { isFieldDay, routeTypeLabel, workingTypeLabel } from '@/lib/planning';
import { notAtLocationReason, saveCall, useOnline, useRecords, type FollowupPayload, type OutboxRecord } from '@/offline';
import { useCachedSource } from '@/offline/cache';
import type { FieldMasterDataSnapshot, PlanningSnapshot, TerritorySnapshot } from '@/types/sync';

type Subject = 'DOCTOR' | 'CHEMIST';

const MAX_REMARKS = 1000;
/** The followup form's fields top to bottom, so a failed save scrolls to the first one with a problem. */
const FIELD_ORDER = ['outlet', 'remarks'];

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
  const fe = useFormErrors(FIELD_ORDER);
  // Days between visits to a doctor (dcr.md rule 11): a follow-up counts as a visit; chemists have no gap.
  const visitGap = useDoctorVisitGap(gate.today, editing);
  const tooSoon = (id: string) => (isDoctor ? visitGap(id) : null);

  const plan =planning.data?.dailyPlans.find((p) => p.planDate === gate.today) ?? null;
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
    const list: { id: string; routeId: string; name: string; address: string; location: { latitude: number; longitude: number } | null; specialty?: string; photoUrl?: string | null }[] =
      isDoctor ? (master.data?.doctors ?? []) : (master.data?.chemists ?? []);
    return [...list].sort((a, b) => Number(notInPlan(a)) - Number(notInPlan(b)) || a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [master.data, isDoctor, plannedRoutes, plannedDoctorIds]);
  const byId = useMemo(() => new Map(outlets.map((o) => [o.id, o])), [outlets]);
  const routeTypeOf = (routeId: string | undefined) => routeTypeLabel(territory.data?.routes.find((r) => r.id === routeId)?.routeType);
  const todays = records.filter((r) => !r.deleted && (r.payload as FollowupPayload).reportDate === gate.today);

  const start = (record: OutboxRecord | 'new') => {
    setMsg(null);
    fe.clearAll();
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
    const problems: Record<string, string> = {};
    if (!outletId) problems.outlet = `Choose the ${noun}.`;
    if (!remarks.trim()) problems.remarks = 'Write what the followup is about.';
    if (!outletId || !remarks.trim()) {
      setMsg({ tone: 'danger', text: 'Fix the fields marked in red.' });
      fe.fail(problems);
      return;
    }
    const soon = tooSoon(outletId);
    if (soon) {
      // The server would refuse it (DOCTOR_VISIT_TOO_SOON), so it isn't kept.
      setMsg({ tone: 'danger', text: 'The followup was not saved.' });
      fe.fail({ outlet: soon.text });
      return;
    }
    fe.clearAll();
    setBusy(true);
    setMsg({ tone: 'info', text: 'Getting your location…' });
    try {
      const fix = await captureLocation();
      const away = await notAtLocationReason(byId.get(outletId)?.location ?? null, fix, noun);
      if (away) {
        // Not at the place: the doctor or chemist field is the one to look at.
        setMsg({ tone: 'danger', text: 'The followup was not saved.' });
        fe.fail({ outlet: away });
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
        <Notice tone="warning" title={gate.cause === 'MONTHLY_PLAN' ? 'Tour plan not approved' : 'Not available right now'}>
          {gate.reason ?? 'Followups open once today’s Tour Plan is approved.'}
        </Notice>
        {gate.cause === 'MONTHLY_PLAN' ? (
          <PrimaryButton label="Go to Tour Plan" variant="text" onPress={() => router.push({ pathname: '/monthly-plan', params: { month: 'current' } })} />
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
      <ScreenShell
        title={editing === 'new' ? `New ${title}` : `Edit ${title}`}
        subtitle="Your location is checked when you save"
        footer={
          <View style={styles.actionsCol}>
            <PrimaryButton label="Save followup" loading={busy} onPress={save} />
            <PrimaryButton
              label="Cancel"
              variant="text"
              disabled={busy}
              onPress={() => {
                setEditing(null);
                setMsg(null);
                fe.clearAll();
              }}
            />
          </View>
        }>
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <CardSection icon={isDoctor ? sym('stethoscope', 'medical_services') : sym('cross.case', 'local_pharmacy')} accent={isDoctor ? 'blue' : 'teal'} title={isDoctor ? 'Doctor' : 'Chemist'}>
        <FormField form={fe} name="outlet">
        <OutletPicker
          label={isDoctor ? 'Doctor' : 'Chemist'}
          options={outlets.map((o) => {
            const soon = tooSoon(o.id);
            return {
              id: o.id,
              name: o.name,
              photoUrl: o.photoUrl,
              disabled: soon !== null,
              subtitle: `${soon ? `${soon.short} · ` : ''}${notInPlan(o) ? 'Not in plan · ' : ''}${o.specialty ? `${o.specialty} · ${o.address}` : o.address}`,
            };
          })}
          value={outletId}
          onChange={(id) => {
            setOutletId(id);
            setMsg(null);
            fe.clear('outlet');
          }}
          disabled={busy}
          emptyText={`No ${noun}s yet. Connect to the internet once so your list can load.`}
          avatars={isDoctor}
        />
        </FormField>
        {picked && tooSoon(picked.id) ? <Notice tone="warning" title="Too soon for another visit">{tooSoon(picked.id)!.text}</Notice> : null}
        {picked && notInPlan(picked) ? (
          <Notice tone="warning" title="Not in your plan">Not in today’s plan: the followup is still saved, and marked that way for your manager.</Notice>
        ) : null}
        {picked && !picked.location ? (
          <Notice tone="warning">{`This ${noun} has no registered location, so a followup can’t be saved yet. Ask Admin to set it.`}</Notice>
        ) : null}
        <ThemedText type="small" themeColor="textSecondary">
          {`You must be at the ${noun}’s place.`}
        </ThemedText>
        </CardSection>
        <CardSection icon={sym('text.bubble', 'chat')} accent="teal" title="Remarks">
          <FormField form={fe} name="remarks" outline={false}>
            <TextField
              label="What needs following up?"
              value={remarks}
              onChangeText={(t) => {
                setRemarks(t);
                setMsg(null);
                fe.clear('remarks');
              }}
              error={fe.errors.remarks}
              multiline
              maxLength={MAX_REMARKS}
              editable={!busy}
              placeholder="What needs following up?"
            />
          </FormField>
        </CardSection>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title={title} subtitle={`${isDoctor ? 'Doctors' : 'Chemists'} to follow up today`}>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      {reportSent ? (
        <Notice tone="info" title="Today’s report is submitted">
          It can’t take more followups unless your manager sends it back.
        </Notice>
      ) : null}
      <View style={styles.head}>
        <View style={styles.grow}>
          <ThemedText type="smallBold" style={styles.sectionTitle}>Today’s followups</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{`${todays.length} logged`}</ThemedText>
        </View>
        {reportSent ? null : <PrimaryButton label="+ Followup" style={styles.newButton} onPress={() => start('new')} />}
      </View>

      {todays.length === 0 ? (
        <Notice tone="info">{`No ${noun} followups today.`}</Notice>
      ) : (
        todays.map((r) => {
          const editable = r.status === 'DRAFT' || r.status === 'FAILED';
          const removable = editable || (r.status === 'SYNCED' && !reportSent);
          const who = byId.get(idOf(r));
          return (
            <InfoCard key={r.clientId}>
              <View style={styles.head}>
                <IconChip icon={isDoctor ? sym('stethoscope', 'medical_services') : sym('cross.case', 'local_pharmacy')} accent={r.status === 'FAILED' ? 'red' : who && notInPlan(who) ? 'amber' : isDoctor ? 'blue' : 'teal'} />
                <View style={styles.grow}>
                  <ThemedText type="smallBold">{who?.name ?? `Unknown ${noun}`}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {[plan ? workingTypeLabel(plan.workingType) : null, routeTypeOf(who?.routeId), STATUS_TEXT[r.status]].filter(Boolean).join(' · ')}
                  </ThemedText>
                </View>
              </View>
              {who && notInPlan(who) ? <Pill text="Not in plan" accent="amber" /> : null}
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
            </InfoCard>
          );
        })
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: Spacing.two },
  actionsCol: { gap: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1, gap: Spacing.one },
  sectionTitle: { fontSize: 18, lineHeight: 24 },
  newButton: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.two + 2 },
});
