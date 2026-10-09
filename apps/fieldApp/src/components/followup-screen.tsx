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
import { removeRecord, saveCall, useRecords, type FollowupPayload, type OutboxRecord } from '@/offline';
import { useCachedSource } from '@/offline/cache';
import type { FieldMasterDataSnapshot } from '@/types/sync';

type Subject = 'DOCTOR' | 'CHEMIST';

const MAX_REMARKS = 1000;

const STATUS_TEXT: Record<OutboxRecord['status'], string> = {
  DRAFT: 'Saved on this phone',
  QUEUED: 'Ready to send',
  SYNCED: 'Sent',
  FAILED: 'Not accepted',
};

/**
 * Dr / Chemist Followup (PRD §6.2.C): a note on someone you've met, added to today's report. Remarks
 * are required. Kept on the phone and sent with Final Submission, so it works offline. Unlike a call
 * it needs no GPS and isn't limited to the routes in today's plan — only to people assigned to you.
 */
export function FollowupScreen({ subject }: { subject: Subject }) {
  const isDoctor = subject === 'DOCTOR';
  const kind = isDoctor ? 'DOCTOR_FOLLOWUP' : 'CHEMIST_FOLLOWUP';
  const noun = isDoctor ? 'doctor' : 'chemist';
  const title = isDoctor ? 'Dr Followup' : 'Chemist Followup';

  const gate = useDayGate();
  const reportSent = useReportSent(gate.today);
  const master = useCachedSource<FieldMasterDataSnapshot>('fieldMasterData');
  const { records } = useRecords([kind]);

  const [editing, setEditing] = useState<OutboxRecord | 'new' | null>(null);
  const [outletId, setOutletId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success'; text: string } | null>(null);

  const idOf = (r: OutboxRecord) => {
    const p = r.payload as FollowupPayload;
    return (isDoctor ? p.doctorId : p.chemistId) ?? '';
  };

  const outlets = useMemo(() => (isDoctor ? (master.data?.doctors ?? []) : (master.data?.chemists ?? [])), [master.data, isDoctor]);
  const names = useMemo(() => new Map(outlets.map((o) => [o.id, o.name])), [outlets]);
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
    const payload: FollowupPayload = {
      reportDate: gate.today,
      ...(isDoctor ? { doctorId: outletId } : { chemistId: outletId }),
      remarks: remarks.trim(),
    };
    try {
      await saveCall(kind, payload, editing && editing !== 'new' ? editing : undefined);
      setEditing(null);
      setMsg({ tone: 'success', text: 'Followup saved. It goes up with Final Submission.' });
    } catch (err) {
      setMsg({ tone: 'danger', text: err instanceof Error ? err.message : 'Could not save the followup.' });
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
          {gate.reason ?? 'Followups open once today’s Tour Plan is approved.'}
        </Notice>
      </ScreenShell>
    );
  }

  if (editing) {
    return (
      <ScreenShell title={editing === 'new' ? `New ${title}` : `Edit ${title}`}>
        <OutletPicker
          label={isDoctor ? 'Doctor' : 'Chemist'}
          options={outlets.map((o) => ({
            id: o.id,
            name: o.name,
            subtitle: 'specialty' in o ? `${o.specialty} · ${o.address}` : o.address,
          }))}
          value={outletId}
          onChange={(id) => {
            setOutletId(id);
            setMsg(null);
          }}
          disabled={busy}
          emptyText={`No ${noun}s yet. Connect to the internet once so your list can load.`}
        />
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
          return (
            <ThemedView key={r.clientId} type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">{names.get(idOf(r)) ?? `Unknown ${noun}`}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {STATUS_TEXT[r.status]}
              </ThemedText>
              <ThemedText type="small">{(r.payload as FollowupPayload).remarks}</ThemedText>
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
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
  actions: { flexDirection: 'row', gap: Spacing.two },
});
