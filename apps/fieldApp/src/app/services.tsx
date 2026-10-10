import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { Notice } from '@/components/notice';
import { OutletPicker } from '@/components/outlet-picker';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { ApiError, NetworkError } from '@/lib/api';
import { withdrawRequest } from '@/lib/marketing';
import { formatRupees, rupeesToPaise } from '@/lib/money';
import { getRejectionReason } from '@/lib/planning';
import {
  createRecord,
  getRecord,
  refreshNow,
  removeRecord,
  sendNow,
  updateRecord,
  useOnline,
  useRecords,
  type OutboxRecord,
} from '@/offline';
import { useCachedSource } from '@/offline/cache';
import type { DoctorServiceType, FieldActivitySnapshot, FieldMasterDataSnapshot, PlanStatus } from '@/types/sync';

const TYPES: { value: DoctorServiceType; label: string }[] = [
  { value: 'TOUR_PACKAGE', label: 'Tour package' },
  { value: 'GIFT', label: 'Gift' },
  { value: 'ONLINE_PROMOTION', label: 'Online promotion' },
  { value: 'OTHERS', label: 'Others' },
];
const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.value, t.label])) as Record<DoctorServiceType, string>;

const STATUS_TEXT: Record<PlanStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Waiting for your manager',
  MANAGER_APPROVED: 'Approved by your manager, waiting for Admin',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
  REOPENED: 'Reopened',
};

type ServicePayload = { doctorId: string; serviceType: DoctorServiceType; amountPaise: number; remarks: string | null };
type Msg = { tone: 'danger' | 'success' | 'info'; text: string };

const errorText = (err: unknown) =>
  err instanceof ApiError || err instanceof NetworkError || err instanceof Error ? err.message : 'Something went wrong. Please try again.';

/**
 * Doctor Services (PRD §6.2): ask for a service for one of your doctors — a tour package, a gift, an online
 * promotion or something else — with the amount. It goes to your manager, then Admin. Requests are saved on
 * the phone and sent when there is a connection.
 */
export default function ServicesScreen() {
  const online = useOnline();
  const activity = useCachedSource<FieldActivitySnapshot>('fieldActivity');
  const master = useCachedSource<FieldMasterDataSnapshot>('fieldMasterData');
  const { records } = useRecords(['DOCTOR_SERVICE']);

  const [editing, setEditing] = useState<OutboxRecord | 'new' | null>(null);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [type, setType] = useState<DoctorServiceType>('TOUR_PACKAGE');
  const [amount, setAmount] = useState('');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const doctors = master.data?.doctors ?? [];
  const doctorName = (id: string) => doctors.find((d) => d.id === id)?.name ?? 'Doctor';
  const unsent = records.filter((r) => !r.deleted && r.status !== 'SYNCED').reverse();
  const sent = activity.data?.doctorServices ?? [];

  const start = (record: OutboxRecord | 'new') => {
    setMsg(null);
    if (record === 'new') {
      setDoctorId(null);
      setType('TOUR_PACKAGE');
      setAmount('');
      setRemarks('');
    } else {
      const p = record.payload as ServicePayload;
      setDoctorId(p.doctorId);
      setType(p.serviceType);
      setAmount(String(p.amountPaise / 100));
      setRemarks(p.remarks ?? '');
    }
    setEditing(record);
  };

  const save = async () => {
    const amountPaise = rupeesToPaise(amount);
    if (!doctorId) return setMsg({ tone: 'danger', text: 'Choose the doctor.' });
    if (amountPaise === null) return setMsg({ tone: 'danger', text: 'Enter the amount in rupees, more than zero, with at most two decimals.' });
    const payload: ServicePayload = { doctorId, serviceType: type, amountPaise, remarks: remarks.trim() || null };
    setBusy('save');
    try {
      const record = editing && editing !== 'new' ? await updateRecord(editing.clientId, payload) : await createRecord('DOCTOR_SERVICE', payload);
      setEditing(null);
      if (!online) {
        setMsg({ tone: 'info', text: 'Saved on this phone. It will be sent when you’re online.' });
      } else {
        await sendNow(['DOCTOR_SERVICE']);
        await refreshNow();
        const after = await getRecord(record.clientId);
        setMsg(
          after?.status === 'FAILED'
            ? { tone: 'danger', text: after.errorMessage ?? 'The server did not accept this request.' }
            : { tone: 'success', text: 'Sent for approval. Your manager decides first, then Admin.' },
        );
      }
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(null);
    }
  };

  const retry = async () => {
    setBusy('retry');
    try {
      await sendNow(['DOCTOR_SERVICE']);
      await refreshNow();
    } finally {
      setBusy(null);
    }
  };

  const remove = async (r: OutboxRecord) => {
    try {
      await removeRecord(r.clientId);
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    }
  };

  const withdraw = async (requestId: string) => {
    setBusy(requestId);
    try {
      await withdrawRequest(requestId);
      await refreshNow();
      setMsg({ tone: 'success', text: 'Withdrawn.' });
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(null);
    }
  };

  const showReason = async (id: string, requestId: string) => {
    try {
      const reason = await getRejectionReason(requestId);
      setReasons((r) => ({ ...r, [id]: reason ?? 'No reason was given.' }));
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    }
  };

  if (editing) {
    return (
      <ScreenShell title={editing === 'new' ? 'New service request' : 'Change request'}>
        <OutletPicker
          label="Doctor"
          options={doctors.map((d) => ({ id: d.id, name: d.name, subtitle: d.address }))}
          value={doctorId}
          onChange={setDoctorId}
          disabled={busy !== null}
          emptyText="No doctors are assigned to you yet."
        />
        <View style={styles.block}>
          <ThemedText type="smallBold">Service</ThemedText>
          <ChoiceChips options={TYPES} value={type} onChange={setType} disabled={busy !== null} />
        </View>
        <TextField
          label="Amount (₹)"
          value={amount}
          onChangeText={(t) => {
            setAmount(t.replace(/[^0-9.]/g, ''));
            setMsg(null);
          }}
          keyboardType="decimal-pad"
          placeholder="0.00"
          editable={busy === null}
        />
        <TextField label="Remarks (optional)" value={remarks} onChangeText={setRemarks} multiline maxLength={1000} editable={busy === null} />
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <PrimaryButton label={online ? 'Send for approval' : 'Save on this phone'} loading={busy === 'save'} onPress={save} />
        <PrimaryButton label="Cancel" variant="text" disabled={busy !== null} onPress={() => setEditing(null)} />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title="Doctor Services">
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      <PrimaryButton label="Request a service" onPress={() => start('new')} />

      {unsent.map((r) => {
        const p = r.payload as ServicePayload;
        return (
          <ThemedView key={r.clientId} type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">{`${TYPE_LABEL[p.serviceType]} · ${formatRupees(p.amountPaise)}`}</ThemedText>
            <ThemedText type="small">{doctorName(p.doctorId)}</ThemedText>
            {p.remarks ? (
              <ThemedText type="small" themeColor="textSecondary">
                {p.remarks}
              </ThemedText>
            ) : null}
            <ThemedText type="small" themeColor={r.status === 'FAILED' ? 'danger' : 'textSecondary'}>
              {r.status === 'FAILED' ? (r.errorMessage ?? 'Not accepted') : 'Saved on this phone, waiting to be sent'}
            </ThemedText>
            <View style={styles.row}>
              {r.status === 'FAILED' ? <PrimaryButton label="Try again" variant="text" loading={busy === 'retry'} onPress={retry} /> : null}
              {r.status !== 'QUEUED' ? <PrimaryButton label="Change" variant="text" onPress={() => start(r)} /> : null}
              {r.status !== 'QUEUED' ? <PrimaryButton label="Remove" variant="text" onPress={() => remove(r)} /> : null}
            </View>
          </ThemedView>
        );
      })}

      {!activity.loaded ? (
        <Notice tone="info">Loading…</Notice>
      ) : sent.length === 0 && unsent.length === 0 ? (
        <Notice tone="info">No service requests yet.</Notice>
      ) : (
        sent.map((s) => (
          <ThemedView key={s.id} type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">{`${TYPE_LABEL[s.serviceType]} · ${formatRupees(s.amountPaise)}`}</ThemedText>
            <ThemedText type="small">{doctorName(s.doctorId)}</ThemedText>
            {s.remarks ? (
              <ThemedText type="small" themeColor="textSecondary">
                {s.remarks}
              </ThemedText>
            ) : null}
            <ThemedText type="small" themeColor={s.status === 'REJECTED' ? 'danger' : 'textSecondary'}>
              {s.origin === 'ADMIN' ? 'Set up by Admin' : STATUS_TEXT[s.status]}
            </ThemedText>
            {reasons[s.id] ? <ThemedText type="small">{`Reason: ${reasons[s.id]}`}</ThemedText> : null}
            {s.approvalRequestId ? (
              <View style={styles.row}>
                {s.status === 'REJECTED' && !reasons[s.id] ? (
                  <PrimaryButton label="See the reason" variant="text" onPress={() => showReason(s.id, s.approvalRequestId!)} />
                ) : null}
                {online && (s.status === 'SUBMITTED' || s.status === 'MANAGER_APPROVED') ? (
                  <PrimaryButton label="Withdraw" variant="text" loading={busy === s.approvalRequestId} onPress={() => withdraw(s.approvalRequestId!)} />
                ) : null}
              </View>
            ) : null}
          </ThemedView>
        ))
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  block: { gap: Spacing.two },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
