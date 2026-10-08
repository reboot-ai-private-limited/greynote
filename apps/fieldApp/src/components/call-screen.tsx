import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { GeofenceBadge } from '@/components/geofence-badge';
import { Notice } from '@/components/notice';
import { OutletPicker } from '@/components/outlet-picker';
import { PrimaryButton } from '@/components/primary-button';
import { SamplesEditor, type SampleLine } from '@/components/samples-editor';
import { ScreenShell } from '@/components/screen-shell';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WorkWithPicker } from '@/components/work-with-picker';
import { Spacing } from '@/constants/theme';
import { useDayGate } from '@/hooks/use-day-gate';
import { captureLocation } from '@/lib/location';
import { WORKING_TYPES, workingTypeLabel, type WorkingType } from '@/lib/planning';
import { removeRecord, saveCall, serverGeofence, useRecords, type CallPayload, type OutboxRecord } from '@/offline';
import { useCachedSource } from '@/offline/cache';
import type { FieldActivitySnapshot, FieldMasterDataSnapshot, PlanningSnapshot } from '@/types/sync';

type Subject = 'DOCTOR' | 'CHEMIST';

const STATUS_TEXT: Record<OutboxRecord['status'], string> = {
  DRAFT: 'Saved on this phone',
  QUEUED: 'Ready to send',
  SYNCED: 'Sent',
  FAILED: 'Not accepted',
};

/**
 * Dr Call / Chemist Call (PRD §6.2.B, HLD 01 §2): pick who you visited, log it, and the phone adds
 * its GPS reading. Everything is kept on the phone and goes up with the day's Final Submission, so
 * the form works offline. A location far from the registered one flags the call for your manager;
 * it never stops you saving.
 */
export function CallScreen({ subject }: { subject: Subject }) {
  const isDoctor = subject === 'DOCTOR';
  const kind = isDoctor ? 'DOCTOR_CALL' : 'CHEMIST_CALL';
  const noun = isDoctor ? 'doctor' : 'chemist';
  const title = isDoctor ? 'Dr Call' : 'Chemist Call';

  const gate = useDayGate();
  const master = useCachedSource<FieldMasterDataSnapshot>('fieldMasterData');
  const planning = useCachedSource<PlanningSnapshot>('planning');
  const activity = useCachedSource<FieldActivitySnapshot>('fieldActivity');
  const { records } = useRecords([kind, 'DCR_SUBMIT']);

  const plan = planning.data?.dailyPlans.find((p) => p.planDate === gate.today) ?? null;
  const plannedRoutes = useMemo(() => new Set(plan?.routeIds ?? []), [plan]);

  const [editing, setEditing] = useState<OutboxRecord | 'new' | null>(null);
  const [outletId, setOutletId] = useState<string | null>(null);
  const [workingType, setWorkingType] = useState<WorkingType>('FIELD_WORK');
  const [workWith, setWorkWith] = useState<string[]>([]);
  const [samples, setSamples] = useState<SampleLine[]>([]);
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success' | 'info'; text: string } | null>(null);

  const idOf = (r: OutboxRecord) => {
    const p = r.payload as CallPayload;
    return (isDoctor ? p.doctorId : p.chemistId) ?? '';
  };

  // The server only accepts a call on a route in today's approved plan.
  const outlets = useMemo(() => {
    const list = isDoctor ? (master.data?.doctors ?? []) : (master.data?.chemists ?? []);
    return list.filter((o) => plannedRoutes.has(o.routeId));
  }, [master.data, isDoctor, plannedRoutes]);
  const outletById = useMemo(
    () => new Map([...(master.data?.doctors ?? []), ...(master.data?.chemists ?? [])].map((o) => [o.id, o])),
    [master.data],
  );
  const products = useMemo(() => new Map((master.data?.products ?? []).map((p) => [p.id, p])), [master.data]);

  // Once today's report is with the manager the server takes no more calls on it (until it is sent back).
  const dcrStatus = activity.data?.dcrs?.find((d) => d.reportDate === gate.today)?.status;
  // The server's status wins; the phone's own record of a sent submit only counts before the first pull.
  const reportSent =
    dcrStatus !== undefined
      ? ['SUBMITTED', 'MANAGER_APPROVED', 'APPROVED'].includes(dcrStatus)
      : records.some((r) => r.kind === 'DCR_SUBMIT' && r.status === 'SYNCED' && (r.payload as CallPayload).reportDate === gate.today);

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
    if (record === 'new') {
      setOutletId(null);
      setWorkingType(plan?.workingType ?? 'FIELD_WORK');
      setWorkWith(plan?.workWith ?? []);
      setSamples([]);
      setRemarks('');
    } else {
      const p = record.payload as CallPayload;
      setOutletId(idOf(record));
      setWorkingType(p.workingType);
      setWorkWith(p.workWith);
      setSamples(p.samples ?? []);
      setRemarks(p.remarks ?? '');
    }
    setEditing(record);
  };

  const save = async () => {
    if (!outletId) {
      setMsg({ tone: 'danger', text: `Choose the ${noun} you visited.` });
      return;
    }
    setBusy(true);
    setMsg({ tone: 'info', text: 'Getting your location…' });
    const fix = await captureLocation();
    const payload: CallPayload = {
      reportDate: gate.today,
      ...(isDoctor ? { doctorId: outletId } : { chemistId: outletId }),
      workingType,
      workWith,
      remarks: remarks.trim() || null,
      capturedLocation: fix?.point ?? null,
      accuracyMeters: fix?.accuracyMeters ?? null,
      ...(isDoctor ? { samples } : {}),
    };
    try {
      await saveCall(kind, payload, editing && editing !== 'new' ? editing : undefined);
      setEditing(null);
      setMsg({
        tone: 'success',
        text: fix
          ? 'Call saved with your location. It goes up with Final Submission.'
          : 'Call saved without a location (GPS was off or refused). Your manager will see it as not verified.',
      });
    } catch (err) {
      setMsg({ tone: 'danger', text: err instanceof Error ? err.message : 'Could not save the call.' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: OutboxRecord) => {
    try {
      await removeRecord(r.clientId);
    } catch (err) {
      setMsg({ tone: 'danger', text: err instanceof Error ? err.message : 'Could not remove it.' });
    }
  };

  if (gate.state !== 'open') {
    return (
      <ScreenShell title={title}>
        <Notice tone="warning" title="Not available right now">
          {gate.reason ?? 'Calls open once today’s Tour Plan is approved.'}
        </Notice>
      </ScreenShell>
    );
  }

  if (editing) {
    const picked = outletId ? outletById.get(outletId) : undefined;
    return (
      <ScreenShell title={editing === 'new' ? `New ${title}` : `Edit ${title}`}>
        <OutletPicker
          label={isDoctor ? 'Doctor' : 'Chemist'}
          options={outlets.map((o) => ({
            id: o.id,
            name: o.name,
            subtitle: `${'specialty' in o ? `${o.specialty} · ${o.address}` : o.address}${calledIds.has(o.id) ? ' · called today' : ''}`,
          }))}
          value={outletId}
          onChange={(id) => {
            setOutletId(id);
            setSamples([]);
          }}
          disabled={busy}
          emptyText={
            plannedRoutes.size === 0
              ? 'Today’s plan has no routes, so there is nobody to visit. Ask your manager to amend the plan.'
              : `No ${noun}s on today’s routes yet. Connect to the internet once so your list can load.`
          }
        />
        {picked && !picked.location ? (
          <Notice tone="warning">{`This ${noun} has no registered location, so the call can’t be location-checked. It still saves.`}</Notice>
        ) : null}

        <View style={styles.block}>
          <ThemedText type="smallBold">Working type</ThemedText>
          <ChoiceChips options={WORKING_TYPES} value={workingType} onChange={setWorkingType} disabled={busy} />
        </View>

        <WorkWithPicker value={workWith} onChange={setWorkWith} disabled={busy} />

        {isDoctor ? (
          <View style={styles.block}>
            <ThemedText type="smallBold">Samples given (optional)</ThemedText>
            {outletId ? (
              <SamplesEditor options={sampleOptions} value={samples} onChange={setSamples} disabled={busy} />
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                Choose the doctor first.
              </ThemedText>
            )}
          </View>
        ) : null}

        <TextField label="Remarks (optional)" value={remarks} onChangeText={setRemarks} multiline maxLength={1000} editable={!busy} />

        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <PrimaryButton label="Save call" loading={busy} onPress={save} />
        <PrimaryButton label="Cancel" variant="text" disabled={busy} onPress={() => setEditing(null)} />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title={title}>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      {reportSent ? (
        <Notice tone="info" title="Today’s report is submitted">
          It can’t take more calls unless your manager sends it back.
        </Notice>
      ) : (
        <PrimaryButton label={`Log a ${title}`} onPress={() => start('new')} />
      )}

      {todays.length === 0 ? (
        <Notice tone="info">{`No ${noun} calls logged today.`}</Notice>
      ) : (
        todays.map((r) => {
          const p = r.payload as CallPayload;
          const who = outletById.get(idOf(r));
          const editable = r.status === 'DRAFT' || r.status === 'FAILED';
          return (
            <ThemedView key={r.clientId} type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">{who?.name ?? `Unknown ${noun}`}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {`${workingTypeLabel(p.workingType)} · ${STATUS_TEXT[r.status]}`}
              </ThemedText>
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
              {editable ? (
                <View style={styles.actions}>
                  <PrimaryButton label="Edit" variant="text" onPress={() => start(r)} />
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
  block: { gap: Spacing.two },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
  actions: { flexDirection: 'row', gap: Spacing.two },
});
