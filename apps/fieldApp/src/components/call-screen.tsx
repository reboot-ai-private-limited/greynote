import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, StyleSheet, Switch, View } from 'react-native';

import { FormField } from '@/components/form-field';
import { GeofenceBadge } from '@/components/geofence-badge';
import { Notice } from '@/components/notice';
import { OutletPicker } from '@/components/outlet-picker';
import { PrimaryButton } from '@/components/primary-button';
import { ProductGivenEditor, type GivenLine } from '@/components/product-given-editor';
import { ScreenShell } from '@/components/screen-shell';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { CardSection, IconChip, InfoCard, sym } from '@/components/ui-cards';
import { prettyDay } from '@/offline/day';
import { WorkWithPicker } from '@/components/work-with-picker';
import { Spacing } from '@/constants/theme';
import { useCallDoctors } from '@/hooks/use-call-doctors';
import { useDayGate } from '@/hooks/use-day-gate';
import { useDoctorVisitGap } from '@/hooks/use-doctor-visit-gap';
import { useFormErrors } from '@/hooks/use-form-errors';
import { useReportSent } from '@/hooks/use-report-sent';
import { getDoctorVisits, type DoctorVisitsReport } from '@/lib/doctor-visits';
import { useFinancialYear } from '@/lib/financial-year';
import { confirmRemove, removeDayRecord } from '@/lib/day-records';
import { LocationCard } from '@/components/location-card';
import { callLocationProblem, useLocationReading } from '@/hooks/use-location-reading';
import { isFieldDay, routeTypeLabel, workingTypeLabel } from '@/lib/planning';
import { createRecord, notAtLocationReason, refreshNow, saveCall, serverGeofence, useOnline, useRecords, type CallPayload, type OutboxRecord } from '@/offline';
import { useCachedSource } from '@/offline/cache';
import { useCachedFetch } from '@/offline/cached-fetch';
import type { FieldActivitySnapshot, FieldMasterDataSnapshot, PlanningSnapshot, TerritorySnapshot } from '@/types/sync';
import { formatRupees } from '@/lib/money';

type Subject = 'DOCTOR' | 'CHEMIST';

/** The call form's fields top to bottom, so a failed save scrolls to the first one with a problem. */
const FIELD_ORDER = ['outlet', 'location'];
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
  const routeName = useMemo(() => new Map((territory.data?.routes ?? []).map((r) => [r.id, r.name])), [territory.data]);
  const reportSent = useReportSent(gate.today);
  const { records } = useRecords([kind]);
  // Gifts Admin allocated (or accepted for a request) for the chosen doctor, still to hand over: each can be marked given as part of this call (the same GIFT_DONE record the Gifts screen sends).
  const activity = useCachedSource<FieldActivitySnapshot>('fieldActivity');
  const { records: giftDone } = useRecords(['GIFT_DONE']);
  const [givenGifts, setGivenGifts] = useState<string[]>([]);
  const { doctors: callDoctors, byId: callDoctorById, teamMissing } = useCallDoctors();

  // Doctors with a visit target show how far along the month is (calls on submitted days; the Missed Calls screen shares this copy).
  const fy = useFinancialYear();
  const visitMonth = gate.today.slice(0, 7);
  const visits = useCachedFetch<DoctorVisitsReport | null>(isDoctor ? `doctor-visits:${fy.year}:${visitMonth}` : 'doctor-visits:none', () => (isDoctor ? getDoctorVisits(visitMonth) : Promise.resolve(null)));
  const madeBy = useMemo(() => new Map((visits.data?.mrs ?? []).flatMap((m) => m.rows).map((r) => [r.doctor.id, r.made])), [visits.data]);

  const plan = planning.data?.dailyPlans.find((p) => p.planDate === gate.today) ?? null;
  // Dr Call offers only today's plan doctors and the ones still owed from earlier days (worked out by the server at every pull); a doctor
  // outside both is reached through Follow-up. Nothing is "not in plan" any more. `carried` = the day a doctor was first planned and missed.
  const carried = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of plan?.doctors ?? []) if (d.carriedFrom) m.set(d.doctorId, d.carriedFrom);
    for (const d of planning.data?.owedDoctors ?? []) if (!m.has(d.doctorId)) m.set(d.doctorId, d.carriedFrom);
    return m;
  }, [plan, planning.data]);
  const plannedDoctorIds = useMemo(() => new Set([...(plan?.doctors ?? []).map((d) => d.doctorId), ...carried.keys()]), [plan, carried]);
  const fieldDay = plan ? isFieldDay(plan.workingType) : true;

  const [editing, setEditing] = useState<OutboxRecord | 'new' | null>(null);
  const [outletId, setOutletId] = useState<string | null>(null);
  const [workWith, setWorkWith] = useState<string[]>([]);
  const [samples, setSamples] = useState<GivenLine[]>([]);
  const [lbl, setLbl] = useState<GivenLine[]>([]);
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success' | 'info'; text: string } | null>(null);
  const fe = useFormErrors(FIELD_ORDER);
  // Days between visits to a doctor (dcr.md rule 11); chemists have no gap.
  const visitGap = useDoctorVisitGap(gate.today, editing);
  const tooSoon = (id: string) => (isDoctor ? visitGap(id) : null);

  const idOf = (r: OutboxRecord) => {
    const p = r.payload as CallPayload;
    return (isDoctor ? p.doctorId : p.chemistId) ?? '';
  };

  // Doctors: today's plan (missed ones first, oldest first, then A to Z). Chemists: those at today's To place (2026-11-27; anywhere else is a
  // follow-up), or every one I hold on an older day without places. One already on a call being edited stays pickable.
  const outlets = useMemo(() => {
    const list: { id: string; routeId: string; name: string }[] = isDoctor
      ? callDoctors.filter((d) => plannedDoctorIds.has(d.id) || d.id === outletId)
      : (master.data?.chemists ?? []).filter((c) => !plan?.toPlaceId || !c.placeId || c.placeId === plan.toPlaceId || c.id === outletId);
    return [...list].sort((a, b) => (carried.get(a.id) ?? '9999').localeCompare(carried.get(b.id) ?? '9999') || a.name.localeCompare(b.name));
  }, [master.data, callDoctors, isDoctor, plannedDoctorIds, carried, outletId, plan]);
  const loc = useLocationReading();
  const outletById = useMemo(
    () => new Map([...callDoctors, ...(master.data?.chemists ?? [])].map((o) => [o.id, o])),
    [callDoctors, master.data],
  );
  const products = useMemo(() => new Map((master.data?.products ?? []).map((p) => [p.id, p])), [master.data]);

  const todays = records.filter((r) => !r.deleted && r.kind === kind && (r.payload as CallPayload).reportDate === gate.today);
  const calledIds = new Set(todays.filter((r) => r !== editing).map(idOf));

  /** Any product on the phone can be given: samples are the employee's own credit, nothing is checked here (the manager reads requested, credited and given). */
  const givenProducts = useMemo(() => (master.data?.products ?? []).map((p) => ({ id: p.id, name: p.name, packSize: p.packSize })), [master.data]);

  const pendingGifts = (isDoctor && outletId ? (activity.data?.pendingGifts ?? []).filter((g) => g.doctorId === outletId) : []).filter(
    (g) => !giftDone.some((r) => !r.deleted && r.status !== 'FAILED' && (r.payload as { giftId: string }).giftId === g.id),
  );

  const start = (record: OutboxRecord | 'new') => {
    setMsg(null);
    fe.clearAll();
    if (record === 'new') {
      setOutletId(null);
      setWorkWith([]); // picked per call; not copied from the day's plan
      setSamples([]);
      setLbl([]);
      setGivenGifts([]);
      setRemarks('');
    } else {
      const p = record.payload as CallPayload;
      setOutletId(idOf(record));
      setWorkWith(p.workWith ?? []);
      setSamples(p.samples ?? []);
      setLbl((p.lbl ?? []).map((l) => ({ productId: l.productId, quantity: 1 })));
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
    const soon = tooSoon(outletId);
    if (soon) {
      // The server would refuse it (DOCTOR_VISIT_TOO_SOON), so it isn't kept.
      setMsg({ tone: 'danger', text: 'The call was not saved.' });
      fe.fail({ outlet: soon.text });
      return;
    }
    if (loc.busy) return setMsg({ tone: 'info', text: 'Still reading your location. Wait for the result, then save.' });
    // The call is saved from a reading the user has seen (Refresh location, under two minutes old, for this doctor or chemist), never from a silent one.
    const locationIssue = callLocationProblem(loc.reading, outletId, noun);
    if (locationIssue) {
      setMsg({ tone: 'danger', text: 'The call was not saved.' });
      fe.fail({ location: locationIssue });
      return;
    }
    fe.clearAll();
    setBusy(true);
    try {
      const fix = loc.fresh(outletId);
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
        ...(isDoctor ? { doctorId: outletId, workWith } : { chemistId: outletId }),
        remarks: remarks.trim() || null,
        capturedLocation: fix?.point ?? null,
        accuracyMeters: fix?.accuracyMeters ?? null,
        ...(isDoctor ? { samples: samples.filter((l) => l.quantity > 0), lbl: lbl.map((l) => ({ productId: l.productId })) } : {}),
      };
      await saveCall(kind, payload, editing && editing !== 'new' ? editing : undefined);
      // A gift marked given here is queued like any other; one already marked on this phone is not marked twice.
      for (const giftId of givenGifts) {
        if (!giftDone.some((r) => !r.deleted && r.status !== 'FAILED' && (r.payload as { giftId: string }).giftId === giftId)) await createRecord('GIFT_DONE', { giftId });
      }
      setGivenGifts([]);
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
        setMsg({ tone: 'info', text: 'Call removed.' });
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
        {isDoctor && teamMissing ? <Notice tone="info">Your team’s doctors haven’t loaded yet. Connect to the internet once to see them here.</Notice> : null}
        <CardSection icon={isDoctor ? sym('stethoscope', 'medical_services') : sym('cross.case', 'local_pharmacy')} accent={isDoctor ? 'blue' : 'teal'} title={isDoctor ? 'Doctor' : 'Chemist'}>
        <FormField form={fe} name="outlet">
        <OutletPicker
          label={isDoctor ? 'Doctor' : 'Chemist'}
          options={outlets.map((o) => {
            const missedFrom = carried.get(o.id);
            const routeLabel = routeName.get(o.routeId);
            const full = outletById.get(o.id);
            const clinic = full && 'clinicName' in full && full.clinicName ? ` · ${full.clinicName}` : '';
            const soon = tooSoon(o.id);
            return {
              id: o.id,
              name: o.name,
              photoUrl: isDoctor ? (callDoctorById.get(o.id)?.photoUrl ?? null) : null,
              disabled: soon !== null,
              subtitle: `${soon ? `${soon.short} · ` : ''}${missedFrom ? `Missed since ${prettyDay(missedFrom)} · ` : ''}${routeLabel ? `(${routeLabel}) · ` : ''}${full && 'mrLabel' in full && full.mrLabel ? `${full.mrLabel} · ` : ''}${full && 'specialty' in full ? `${full.specialty}${clinic} · ${full.address}` : (full?.address ?? '')}${
                full && 'visitFrequency' in full && full.visitFrequency ? ` · ${madeBy.has(o.id) ? `${madeBy.get(o.id)} of ${full.visitFrequency}` : full.visitFrequency} visits${madeBy.has(o.id) ? ' this month' : ' a month'}` : ''
              }${calledIds.has(o.id) ? ' · called today' : ''}`,
            };
          })}
          value={outletId}
          onChange={(id) => {
            setOutletId(id);
            setSamples([]);
            setLbl([]);
            setGivenGifts([]);
            setMsg(null);
            fe.clear('outlet');
          }}
          disabled={busy}
          emptyText={isDoctor ? 'No doctors planned today. Use Follow-up for another doctor, or ask your manager or Admin to change the plan.' : `No ${noun}s for you yet. Connect to the internet once so your list can load.`}
          avatars={isDoctor}
        />
        </FormField>
        {!isDoctor && picked?.phone ? <PrimaryButton label={picked.phone} variant="text" onPress={() => void Linking.openURL(`tel:${picked.phone}`)} style={styles.phone} /> : null}
        {picked && tooSoon(picked.id) ? <Notice tone="warning" title="Too soon for another visit">{tooSoon(picked.id)!.text}</Notice> : null}
        {plan ? (
          <ThemedText type="small" themeColor="textSecondary">
            {`Work type: ${workingTypeLabel(plan.workingType)} (from today’s plan). You must be within reach of the ${noun}.`}
          </ThemedText>
        ) : null}
        </CardSection>

        <FormField form={fe} name="location">
          <LocationCard
            mode="visit"
            noun={noun}
            place={picked ? { id: picked.id, name: picked.name, hasLocation: Boolean(picked.location) } : null}
            reading={loc.reading}
            busy={loc.busy}
            progressMeters={loc.progress}
            onRefresh={() => {
              if (!picked) return;
              fe.clear('location');
              void loc.refresh({ id: picked.id, point: picked.location ?? null });
            }}
            onCheckAgain={async () => {
              await refreshNow();
            }}
          />
        </FormField>

        {/* A chemist call has no Work With (2026-11-02): only a doctor call records who joined. */}
        {isDoctor ? (
          <CardSection icon={sym('person.2', 'groups')} accent="purple" title="Work with">
            <WorkWithPicker value={workWith} onChange={setWorkWith} disabled={busy} />
          </CardSection>
        ) : null}

        {isDoctor ? (
          <>
            <CardSection icon={sym('pills', 'medication')} accent="amber" title="Samples given (optional)">
              {outletId ? (
                <ProductGivenEditor products={givenProducts} value={samples} onChange={setSamples} withQuantity disabled={busy} />
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  Choose the doctor first.
                </ThemedText>
              )}
            </CardSection>
            <CardSection icon={sym('doc.text', 'description')} accent="teal" title="LBL given (optional)">
              {outletId ? (
                <ProductGivenEditor products={givenProducts} value={lbl} onChange={setLbl} withQuantity={false} disabled={busy} />
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  Choose the doctor first.
                </ThemedText>
              )}
            </CardSection>
            {pendingGifts.length > 0 ? (
              <CardSection icon={sym('gift', 'redeem')} accent="pink" title="Gift for this doctor">
                <ThemedText type="small" themeColor="textSecondary">A gift is waiting for this doctor. Switch it on if you gave it in this call; it is marked done when the report is sent.</ThemedText>
                {pendingGifts.map((g) => (
                  <View key={g.id} style={styles.giftRow}>
                    <View style={styles.giftName}>
                      <ThemedText type="default">{g.productName}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">{formatRupees(g.amountPaise)}</ThemedText>
                    </View>
                    <ThemedText type="small">Given</ThemedText>
                    <Switch
                      accessibilityLabel={`${g.productName} given`}
                      value={givenGifts.includes(g.id)}
                      disabled={busy}
                      onValueChange={(on) => setGivenGifts((ids) => (on ? [...ids, g.id] : ids.filter((x) => x !== g.id)))}
                    />
                  </View>
                ))}
              </CardSection>
            ) : null}
          </>
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
          return (
            <InfoCard key={r.clientId}>
              <View style={styles.head}>
                <IconChip icon={isDoctor ? sym('stethoscope', 'medical_services') : sym('cross.case', 'local_pharmacy')} accent={r.status === 'FAILED' ? 'red' : isDoctor ? 'blue' : 'teal'} />
                <View style={styles.grow}>
                  <ThemedText type="smallBold">{who?.name ?? `Unknown ${noun}`}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {[plan ? workingTypeLabel(plan.workingType) : null, routeTypeOf(who?.routeId), STATUS_TEXT[r.status]].filter(Boolean).join(' · ')}
                  </ThemedText>
                </View>
              </View>
              <GeofenceBadge
                result={serverGeofence(r)}
                registered={who?.location ?? null}
                captured={p.capturedLocation}
                accuracyMeters={p.accuracyMeters}
              />
              {p.samples?.length ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {`Samples: ${p.samples.map((s) => `${products.get(s.productId)?.name ?? 'Product'} × ${s.quantity}`).join(', ')}`}
                </ThemedText>
              ) : null}
              {p.lbl?.length ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {`LBL: ${p.lbl.map((l) => products.get(l.productId)?.name ?? 'Product').join(', ')}`}
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
  phone: { alignSelf: 'flex-start' },
  giftRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  giftName: { flex: 1 },
});
