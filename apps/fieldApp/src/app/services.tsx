import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { Notice } from '@/components/notice';
import { FormField } from '@/components/form-field';
import { OutletPicker } from '@/components/outlet-picker';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { CardSection, IconChip, InfoCard, Pill, SummaryStrip, sym } from '@/components/ui-cards';
import { Spacing } from '@/constants/theme';
import { useFormErrors } from '@/hooks/use-form-errors';
import { ApiError, NetworkError } from '@/lib/api';
import { withdrawRequest } from '@/lib/marketing';
import { formatRupees, rupeesToPaise } from '@/lib/money';
import { getRejectionReason } from '@/lib/planning';
import { listMyServices, serviceStage, type ServiceView } from '@/lib/services';
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
import { useCachedFetch } from '@/offline/cached-fetch';
import { formatWhen } from '@/offline/day';
import type { DoctorServiceType, FieldActivitySnapshot, FieldMasterDataSnapshot } from '@/types/sync';

const TYPES: { value: DoctorServiceType; label: string }[] = [
  { value: 'TOUR_PACKAGE', label: 'Tour package' },
  { value: 'GIFT', label: 'Gift' },
  { value: 'ONLINE_PROMOTION', label: 'Online promotion' },
  { value: 'OTHERS', label: 'Others' },
];
const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.value, t.label])) as Record<DoctorServiceType, string>;

type ServiceRow = ServiceView;
type ServicePayload ={ doctorId: string; serviceType: DoctorServiceType; amountPaise: number; remarks: string | null };
type Msg = { tone: 'danger' | 'success' | 'info'; text: string };

/** The request form's fields top to bottom, so a failed send scrolls to the first one with a problem. */
const FIELD_ORDER = ['doctor', 'amount'];
const errorText =(err: unknown) =>
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
  const fe = useFormErrors(FIELD_ORDER);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const doctors = master.data?.doctors ?? [];
  const doctorName = (id: string) => doctors.find((d) => d.id === id)?.name ?? 'Doctor';
  const unsent = records.filter((r) => !r.deleted && r.status !== 'SYNCED').reverse();
  // The list from the server says whether each approved service was carried out; the offline snapshot is the fallback.
  const list = useCachedFetch<ServiceView[]>('doctor-services', listMyServices, records.filter((r) => r.status === 'SYNCED').length);
  const sent: ServiceRow[] = list.data ?? (activity.data?.doctorServices ?? []).map((s) => ({ ...s, approval: s.approvalRequestId ? { requestId: s.approvalRequestId, cycle: 0 } : null, doneAt: null, awaitingDone: false }));

  // One doctor's requests, or all of them.
  const [doctorFilter, setDoctorFilter] = useState('ALL');
  const doctorsWithRequests = [...new Set(sent.map((s) => s.doctorId))].map((id) => ({ id, name: doctorName(id) }));
  const shownSent = doctorFilter === 'ALL' ? sent : sent.filter((s) => s.doctorId === doctorFilter);
  // Approved and not carried out = to do; waiting = still with the manager or Admin.
  const stageOf = (s: ServiceRow) => (s.doneAt ? 'DONE' : s.status === 'APPROVED' ? 'TODO' : s.status === 'SUBMITTED' || s.status === 'MANAGER_APPROVED' ? 'WAITING' : 'OTHER');
  const waitingCount = sent.filter((s) => stageOf(s) === 'WAITING').length + unsent.length;
  const toDoCount = sent.filter((s) => stageOf(s) === 'TODO').length;
  const doneCount = sent.filter((s) => stageOf(s) === 'DONE').length;

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
    const problems: Record<string, string> = {};
    if (!doctorId) problems.doctor = 'Choose the doctor.';
    if (amountPaise === null) problems.amount = 'Enter the amount in rupees, more than zero, with at most two decimals.';
    if (!doctorId || amountPaise === null) {
      setMsg({ tone: 'danger', text: 'Fix the fields marked in red.' });
      return fe.fail(problems);
    }
    fe.clearAll();
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
        list.reload();
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
      list.reload();
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
      <ScreenShell
        title={editing === 'new' ? 'New service request' : 'Change request'}
        subtitle="Your manager decides first, then Admin"
        footer={
          <View style={styles.block}>
            <PrimaryButton label={online ? 'Send for approval' : 'Save on this phone'} loading={busy === 'save'} onPress={save} />
            <PrimaryButton label="Cancel" variant="text" disabled={busy !== null} onPress={() => setEditing(null)} />
          </View>
        }>
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <CardSection icon={sym('stethoscope', 'medical_services')} accent="indigo" title="Doctor">
          <FormField form={fe} name="doctor">
            <OutletPicker
              label="Doctor"
              options={[...doctors].sort((a, b) => a.name.localeCompare(b.name)).map((d) => ({ id: d.id, name: d.name, subtitle: d.address }))}
              value={doctorId}
              onChange={(id) => {
                setDoctorId(id);
                fe.clear('doctor');
              }}
              disabled={busy !== null}
              emptyText="No doctors are assigned to you yet."
            />
          </FormField>
        </CardSection>
        <CardSection icon={sym('briefcase', 'work')} accent="purple" title="Service">
          <ChoiceChips options={TYPES} value={type} onChange={setType} disabled={busy !== null} />
          <FormField form={fe} name="amount" outline={false}>
            <TextField
              label="Amount (₹)"
              value={amount}
              onChangeText={(t) => {
                setAmount(t.replace(/[^0-9.]/g, ''));
                setMsg(null);
                fe.clear('amount');
              }}
              error={fe.errors.amount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              editable={busy === null}
            />
          </FormField>
        </CardSection>
        <CardSection icon={sym('text.bubble', 'chat')} accent="teal" title="Remarks">
          <TextField label="Remarks (optional)" value={remarks} onChangeText={setRemarks} multiline maxLength={1000} editable={busy === null} />
        </CardSection>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title="Doctor Services" subtitle="Request a service for a doctor and follow it to done" onRefresh={list.reload} refreshing={list.refreshing}>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      <SummaryStrip
        items={[
          { label: 'Waiting', value: String(waitingCount).padStart(2, '0'), accent: 'amber' },
          { label: 'To do', value: String(toDoCount).padStart(2, '0'), accent: 'blue' },
          { label: 'Done', value: String(doneCount).padStart(2, '0'), accent: 'green' },
        ]}
      />
      <View style={styles.sectionHead}>
        <View style={styles.grow}>
          <ThemedText type="smallBold" style={styles.sectionTitle}>Your requests</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Newest first</ThemedText>
        </View>
        <PrimaryButton label="+ Request" style={styles.newButton} onPress={() => start('new')} />
      </View>

      {doctorsWithRequests.length > 1 ? (
        <ChoiceChips options={[{ value: 'ALL', label: 'All doctors' }, ...doctorsWithRequests.map((d) => ({ value: d.id, label: d.name }))]} value={doctorFilter} onChange={setDoctorFilter} />
      ) : null}

      {unsent.map((r) => {
        const p = r.payload as ServicePayload;
        return (
          <InfoCard key={r.clientId}>
            <View style={styles.spread}>
              <IconChip icon={sym('briefcase', 'work')} accent="slate" />
              <View style={styles.grow}>
                <ThemedText type="smallBold" numberOfLines={1}>{doctorName(p.doctorId)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{`${TYPE_LABEL[p.serviceType]}${p.remarks ? ` · ${p.remarks}` : ''}`}</ThemedText>
              </View>
              <ThemedText type="smallBold">{formatRupees(p.amountPaise)}</ThemedText>
            </View>
            <ThemedText type="small" themeColor={r.status === 'FAILED' ? 'danger' : 'textSecondary'}>
              {r.status === 'FAILED' ? (r.errorMessage ?? 'Not accepted') : 'Saved on this phone, waiting to be sent'}
            </ThemedText>
            <View style={styles.row}>
              {r.status === 'FAILED' ? <PrimaryButton label="Try again" variant="text" loading={busy === 'retry'} onPress={retry} /> : null}
              {r.status !== 'QUEUED' ? <PrimaryButton label="Change" variant="text" onPress={() => start(r)} /> : null}
              {r.status !== 'QUEUED' ? <PrimaryButton label="Remove" variant="text" onPress={() => remove(r)} /> : null}
            </View>
          </InfoCard>
        );
      })}

      {!activity.loaded && !list.data ? (
        <Notice tone="info">Loading…</Notice>
      ) : sent.length === 0 && unsent.length === 0 ? (
        <Notice tone="info">No service requests yet.</Notice>
      ) : (
        shownSent.map((s) => {
          const stage = s.origin === 'ADMIN' && !s.doneAt ? { text: 'Set up by Admin, to do', accent: 'blue' as const } : serviceStage(s);
          const requestId = s.approval?.requestId ?? null;
          return (
            <InfoCard key={s.id}>
              <View style={styles.spread}>
                <IconChip icon={sym('briefcase', 'work')} accent="indigo" />
                <View style={styles.grow}>
                  <ThemedText type="smallBold" numberOfLines={1}>{doctorName(s.doctorId)}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">{`${TYPE_LABEL[s.serviceType]}${s.remarks ? ` · ${s.remarks}` : ''}`}</ThemedText>
                </View>
                <ThemedText type="smallBold">{formatRupees(s.amountPaise)}</ThemedText>
              </View>
              <Pill text={stage.text} accent={stage.accent} />
              {s.doneAt ? <ThemedText type="small" themeColor="textSecondary">{`Carried out on ${formatWhen(s.doneAt)}`}</ThemedText> : null}
              {reasons[s.id] ? <ThemedText type="small">{`Reason: ${reasons[s.id]}`}</ThemedText> : null}
              <PrimaryButton label="Details →" variant="text" disabled={!online} onPress={() => router.push({ pathname: '/service-detail', params: { id: s.id } })} />
              {requestId ? (
                <View style={styles.row}>
                  {s.status === 'REJECTED' && !reasons[s.id] ? (
                    <PrimaryButton label="See the reason" variant="text" onPress={() => showReason(s.id, requestId)} />
                  ) : null}
                  {online && (s.status === 'SUBMITTED' || s.status === 'MANAGER_APPROVED') ? (
                    <PrimaryButton label="Withdraw" variant="text" loading={busy === requestId} onPress={() => withdraw(requestId)} />
                  ) : null}
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
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  spread: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  sectionTitle: { fontSize: 18, lineHeight: 24 },
  newButton: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.two + 2 },
});
