import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FormField } from '@/components/form-field';
import { GeofenceBadge } from '@/components/geofence-badge';
import { Notice } from '@/components/notice';
import { OutletPicker } from '@/components/outlet-picker';
import { PrimaryButton } from '@/components/primary-button';
import { SamplesEditor, type SampleLine } from '@/components/samples-editor';
import { ScreenShell } from '@/components/screen-shell';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { CardSection, IconChip, InfoCard, Pill, sym } from '@/components/ui-cards';
import { WorkWithPicker } from '@/components/work-with-picker';
import { Spacing } from '@/constants/theme';
import { useDayGate } from '@/hooks/use-day-gate';
import { useFormErrors } from '@/hooks/use-form-errors';
import { useReportSent } from '@/hooks/use-report-sent';
import { getDoctorVisits, type DoctorVisitsReport } from '@/lib/doctor-visits';
import { useFinancialYear } from '@/lib/financial-year';
import { confirmRemove, removeDayRecord } from '@/lib/day-records';
import { captureLocation } from '@/lib/location';
import { isFieldDay, routeTypeLabel, workingTypeLabel } from '@/lib/planning';
import { notAtLocationReason, saveCall, serverGeofence, useOnline, useRecords, type CallPayload, type OutboxRecord } from '@/offline';
import { useCachedSource } from '@/offline/cache';
import { useCachedFetch } from '@/offline/cached-fetch';
import type { FieldMasterDataSnapshot, PlanningSnapshot, TerritorySnapshot } from '@/types/sync';

type Subject = 'DOCTOR' | 'CHEMIST';

/** The call form's fields top to bottom, so a failed save scrolls to the first one with a problem. */
const FIELD_ORDER = ['outlet'];
const STATUS_TEXT: Record<OutboxRecord['status'], string> = {
  DRAFT: 'Saved on this phone',
  QUEUED: 'Ready to send',
  SYNCED: 'Sent',
  FAILED: 'Not accepted',
};

/**
 * Dr Call / Chemist Call (PRD §6.2.B, docs/mobile/dcr.md): pick who you visited, log it, and the phone adds its GPS reading.
 * Everything is kept on the phone and goes up with the day's Final Submission, so the form works offline. The location is
 * required: away from the doctor or chemist (or with no GPS) the call isn't saved — the server would refuse it anyway. The
 * work type is the day's plan type, stamped by the server; calls exist only on Field Work and Doctor Campaign days. A call
 * off the day's plan is saved and flagged, never refused.
 */
export function CallScreen({ subject }: { subject: Subject }) {
  const isDoctor = subject === 'DOCTOR';
  const kind = isDoctor ? 'DOCTOR_CALL' : 'CHEMIST_CALL';
  const noun = isDoctor ? 'doctor' : 'chemist';
  const title = isDoctor ? 'Dr Call' : 'Chemist Call';

  const gate = useDayGate();
  const master = useCachedSource<FieldMasterDataSnapshot>('fieldMasterData');
  const planning = useCachedSource<PlanningSnapshot>('planning');
  const territory = useCachedSource<TerritorySnapshot>('territory');
  const online = useOnline();
  /** "Ex-station" etc.: the route type the server stamps on the call, read from the cached routes. */
  const routeTypeOf = (routeId: string | undefined) =>
    routeTypeLabel(territory.data?.routes.find((r) => r.id === routeId)?.routeType);
  const reportSent = useReportSent(gate.today);
  const { records } = useRecords([kind]);

  // Doctors with a visit target show how far along the month is (calls on submitted days; the Missed Calls screen shares this copy).
  const fy = useFinancialYear();
  const visitMonth = gate.today.slice(0, 7);
  const visits = useCachedFetch<DoctorVisitsReport | null>(isDoctor ? `doctor-visits:${fy.year}:${visitMonth}` : 'doctor-visits:none', () => (isDoctor ? getDoctorVisits(visitMonth) : Promise.resolve(null)));
  const madeBy = useMemo(() => new Map((visits.data?.mrs ?? []).flatMap((m) => m.rows).map((r) => [r.doctor.id, r.made])), [visits.data]);

  const plan = planning.data?.dailyPlans.find((p) => p.planDate === gate.today) ?? null;
  const plannedRoutes = useMemo(() => new Set(plan?.routeIds ?? []), [plan]);
  const plannedDoctorIds = useMemo(() => new Set((plan?.doctors ?? []).map((d) => d.doctorId)), [plan]);
  const hasPlannedDoctors = (plan?.doctors?.length ?? 0) > 0;
  const fieldDay = plan ? isFieldDay(plan.workingType) : true;

  /** The plan flags the server will set on this call: a doctor off the day's list, or a route the plan doesn't list. */
  const flagsFor = (o: { id: string; routeId: string }) => {
    const flags: string[] = [];
    if (isDoctor && hasPlannedDoctors && !plannedDoctorIds.has(o.id)) flags.push('Not in plan');
    if (!plannedRoutes.has(o.routeId)) flags.push('Route not in plan');
    return flags;
  };

  const [editing, setEditing] = useState<OutboxRecord | 'new' | null>(null);
  const [outletId, setOutletId] = useState<string | null>(null);
  const [workWith, setWorkWith] = useState<string[]>([]);
  const [samples, setSamples] = useState<SampleLine[]>([]);
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success' | 'info'; text: string } | null>(null);
  const fe = useFormErrors(FIELD_ORDER);

  const idOf = (r: OutboxRecord) => {
    const p = r.payload as CallPayload;
    return (isDoctor ? p.doctorId : p.chemistId) ?? '';
  };

  // Anyone the snapshot lists can be picked (doctors assigned to me, chemists on my routes); off-plan ones are flagged, not
  // refused. The day's planned doctors come first, then the rest on the day's routes, then everyone else.
  const outlets = useMemo(() => {
    const list: { id: string; routeId: string; name: string }[] = isDoctor ? (master.data?.doctors ?? []) : (master.data?.chemists ?? []);
    const rank = (o: { id: string; routeId: string }) =>
      isDoctor && plannedDoctorIds.has(o.id) ? 0 : plannedRoutes.has(o.routeId) ? 1 : 2;
    return [...list].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }, [master.data, isDoctor, plannedRoutes, plannedDoctorIds]);
  const outletById = useMemo(
    () => new Map([...(master.data?.doctors ?? []), ...(master.data?.chemists ?? [])].map((o) => [o.id, o])),
    [master.data],
  );
  const products = useMemo(() => new Map((master.data?.products ?? []).map((p) => [p.id, p])), [master.data]);

  const todays = records.filter((r) => !r.deleted && r.kind === kind && (r.payload as CallPayload).reportDate === gate.today);
  const calledIds = new Set(todays.filter((r) => r !== editing).map(idOf));

  /** What the doctor can still be given: the allocation, less what other unsent calls today already use. */
  const sampleOptions = useMemo(() => {
    if (!isDoctor || !outletId) return [];
    const used = new Map<string, number>();
    for (const r of todays) {
      const p = r.payload as CallPayload;
      if (r === editing || r.status === 'SYNCED' || p.doctorId !== outletId) continue;
      for (const s of p.samples ?? []) used.set(s.productId, (used.get(s.productId) ?? 0) + s.quantity);
    }
    return (master.data?.sampleAllocations ?? [])
      .filter((a) => a.doctorId === outletId)
      .map((a) => ({
        productId: a.productId,
        name: products.get(a.productId)?.name ?? 'Product',
        packSize: products.get(a.productId)?.packSize ?? null,
        available: Math.max(0, a.quantityRemaining - (used.get(a.productId) ?? 0)),
      }))
      .filter((o) => o.available > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDoctor, outletId, master.data, products, records, editing]);

  const start = (record: OutboxRecord | 'new') => {
    setMsg(null);
    fe.clearAll();
    if (record === 'new') {
      setOutletId(null);
      setWorkWith([]); // picked per call; not copied from the day's plan
      setSamples([]);
      setRemarks('');
    } else {
      const p = record.payload as CallPayload;
      setOutletId(idOf(record));
      setWorkWith(p.workWith);
      setSamples(p.samples ?? []);
      setRemarks(p.remarks ?? '');
    }
    setEditing(record);
  };

  const save = async () => {
    if (!outletId) {
      setMsg({ tone: 'danger', text: 'Fix the fields marked in red.' });
      fe.fail({ outlet: `Choose the ${noun} you visited.` });
      return;
    }
    fe.clearAll();
    setBusy(true);
    setMsg({ tone: 'info', text: 'Getting your location…' });
    try {
      const fix = await captureLocation();
      // The server stores a call only at the place: check here first so a call that would be refused is never kept.
      const away = await notAtLocationReason(outletById.get(outletId)?.location ?? null, fix, noun);
      if (away) {
        // Not at the place: the doctor or chemist field is the one to look at.
        setMsg({ tone: 'danger', text: 'The call was not saved.' });
        fe.fail({ outlet: away });
        return;
      }
      const payload: CallPayload = {
        reportDate: gate.today,
        ...(isDoctor ? { doctorId: outletId } : { chemistId: outletId }),
        workWith,
        remarks: remarks.trim() || null,
        capturedLocation: fix?.point ?? null,
        accuracyMeters: fix?.accuracyMeters ?? null,
        ...(isDoctor ? { samples } : {}),
      };
      await saveCall(kind, payload, editing && editing !== 'new' ? editing : undefined);
      setEditing(null);
      setMsg({ tone: 'success', text: 'Call saved with your location. It goes up with Final Submission.' });
    } catch (err) {
      setMsg({ tone: 'danger', text: err instanceof Error ? err.message : 'Could not save the call.' });
    } finally {
      setBusy(false);
    }
  };

  const remove = (r: OutboxRecord) =>
    confirmRemove('call', async () => {
      if (r.status === 'SYNCED' && !online) {
        setMsg({ tone: 'danger', text: 'Removing a call that was already sent needs the internet.' });
        return;
      }
      try {
        await removeDayRecord(r);
        setMsg({ tone: 'info', text: isDoctor && r.status === 'SYNCED' ? 'Call removed. Its samples were given back.' : 'Call removed.' });
      } catch (err) {
        setMsg({ tone: 'danger', text: err instanceof Error ? err.message : 'Could not remove it.' });
      }
    });

  if (gate.state !== 'open') {
    const isMonthlyBlock = gate.cause === 'MONTHLY_PLAN';
    return (
      <ScreenShell title={title}>
        <Notice tone="warning" title={isMonthlyBlock ? 'Tour plan not approved' : 'Not available right now'}>
          {gate.reason ?? 'Calls open once today’s Tour Plan is approved.'}
        </Notice>
        {isMonthlyBlock ? (
          <PrimaryButton label="Go to Tour Plan" variant="text" onPress={() => router.push({ pathname: '/monthly-plan', params: { month: 'current' } })} />
        ) : null}
      </ScreenShell>
    );
  }

  if (!fieldDay && plan) {
    return (
      <ScreenShell title={title}>
        <Notice tone="info" title={`Today is a ${workingTypeLabel(plan.workingType)} day`}>
          {`There are no calls on a ${workingTypeLabel(plan.workingType)} day. Write your note for the day on Summary & Submit and send the daily report from there.`}
        </Notice>
        <PrimaryButton label="Go to Summary & Submit" variant="text" onPress={() => router.push('/summary')} />
      </ScreenShell>
    );
  }

  if (editing) {
    const picked = outletId ? outletById.get(outletId) : undefined;
    return (
      <ScreenShell
        title={editing === 'new' ? `New ${title}` : `Edit ${title}`}
        subtitle="Your location is checked when you save"
        footer={
          <View style={styles.block}>
            <PrimaryButton label="Save call" loading={busy} onPress={save} />
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
            const flags = flagsFor(o);
            const full = outletById.get(o.id);
            const clinic = full && 'clinicName' in full && full.clinicName ? ` · ${full.clinicName}` : '';
            return {
              id: o.id,
              name: o.name,
              subtitle: `${flags.length ? `${flags.join(' · ')} · ` : ''}${full && 'specialty' in full ? `${full.specialty}${clinic} · ${full.address}` : (full?.address ?? '')}${
                full && 'visitFrequency' in full && full.visitFrequency ? ` · ${madeBy.has(o.id) ? `${madeBy.get(o.id)} of ${full.visitFrequency}` : full.visitFrequency} visits${madeBy.has(o.id) ? ' this month' : ' a month'}` : ''
              }${calledIds.has(o.id) ? ' · called today' : ''}`,
            };
          })}
          value={outletId}
          onChange={(id) => {
            setOutletId(id);
            setSamples([]);
            setMsg(null);
            fe.clear('outlet');
          }}
          disabled={busy}
          emptyText={`No ${noun}s for you yet. Connect to the internet once so your list can load.`}
        />
        </FormField>
        {picked && flagsFor(picked).length > 0 ? (
          <Notice tone="warning" title="Not in your plan">
            {`${flagsFor(picked).join(' and ')}: the call is still saved, and marked that way in your daily report for your manager.`}
          </Notice>
        ) : null}
        {picked && !picked.location ? (
          <Notice tone="warning">{`This ${noun} has no registered location, so a call can’t be saved yet. Ask Admin to set it.`}</Notice>
        ) : null}
        {plan ? (
          <ThemedText type="small" themeColor="textSecondary">
            {`Work type: ${workingTypeLabel(plan.workingType)} (from today’s plan). You must be within reach of the ${noun}.`}
          </ThemedText>
        ) : null}
        </CardSection>

        <CardSection icon={sym('person.2', 'groups')} accent="purple" title="Work with">
          <WorkWithPicker value={workWith} onChange={setWorkWith} disabled={busy} />
        </CardSection>

        {isDoctor ? (
          <CardSection icon={sym('pills', 'medication')} accent="amber" title="Samples given (optional)">
            {outletId ? (
              <SamplesEditor options={sampleOptions} value={samples} onChange={setSamples} disabled={busy} />
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                Choose the doctor first.
              </ThemedText>
            )}
          </CardSection>
        ) : null}

        <CardSection icon={sym('text.bubble', 'chat')} accent="teal" title="Remarks">
          <TextField label="Remarks (optional)" value={remarks} onChangeText={setRemarks} multiline maxLength={1000} editable={!busy} />
        </CardSection>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title={title} subtitle={`${isDoctor ? 'Doctors' : 'Chemists'} you visited today`}>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      {reportSent ? (
        <Notice tone="info" title="Today’s report is submitted">
          It can’t take more calls unless your manager sends it back.
        </Notice>
      ) : null}
      <View style={styles.head}>
        <View style={styles.grow}>
          <ThemedText type="smallBold" style={styles.sectionTitle}>Today’s calls</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{`${todays.length} logged`}</ThemedText>
        </View>
        {reportSent ? null : <PrimaryButton label={isDoctor ? '+ Doctor call' : '+ Chemist call'} style={styles.newButton} onPress={() => start('new')} />}
      </View>

      {todays.length === 0 ? (
        <Notice tone="info">{`No ${noun} calls logged today.`}</Notice>
      ) : (
        todays.map((r) => {
          const p = r.payload as CallPayload;
          const who = outletById.get(idOf(r));
          const editable = r.status === 'DRAFT' || r.status === 'FAILED';
          // A call already on the server can still be removed while the report isn't with the manager (it was sent back).
          const removable = editable || (r.status === 'SYNCED' && !reportSent);
          const flags = who ? flagsFor(who) : [];
          return (
            <InfoCard key={r.clientId}>
              <View style={styles.head}>
                <IconChip icon={isDoctor ? sym('stethoscope', 'medical_services') : sym('cross.case', 'local_pharmacy')} accent={r.status === 'FAILED' ? 'red' : flags.length ? 'amber' : isDoctor ? 'blue' : 'teal'} />
                <View style={styles.grow}>
                  <ThemedText type="smallBold">{who?.name ?? `Unknown ${noun}`}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {[plan ? workingTypeLabel(plan.workingType) : null, routeTypeOf(who?.routeId), STATUS_TEXT[r.status]].filter(Boolean).join(' · ')}
                  </ThemedText>
                </View>
              </View>
              {flags.length ? <Pill text={flags.join(' · ')} accent="amber" /> : null}
              <GeofenceBadge
                result={serverGeofence(r)}
                registered={who?.location ?? null}
                captured={p.capturedLocation}
                accuracyMeters={p.accuracyMeters}
              />
              {p.samples?.length ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {p.samples.map((s) => `${products.get(s.productId)?.name ?? 'Product'} × ${s.quantity}`).join(', ')}
                </ThemedText>
              ) : null}
              {p.remarks ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {p.remarks}
                </ThemedText>
              ) : null}
              {r.status === 'FAILED' && r.errorMessage ? (
                <ThemedText type="small" themeColor="danger">
                  {r.errorMessage}
                </ThemedText>
              ) : null}
              {r.status === 'FAILED' && r.errorCode === 'NOT_AT_LOCATION' ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Refused for its location — remove it, go to the place and add the call again.
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
  block: { gap: Spacing.two },
  actions: { flexDirection: 'row', gap: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1, gap: Spacing.one },
  sectionTitle: { fontSize: 18, lineHeight: 24 },
  newButton: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.two + 2 },
});
