import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { Notice } from '@/components/notice';
import { NumberedRow } from '@/components/numbered-row';
import { FormField } from '@/components/form-field';
import { OutletPicker } from '@/components/outlet-picker';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { CardSection, IconChip, InfoCard, Pill, SummaryStrip, sym } from '@/components/ui-cards';
import { Spacing } from '@/constants/theme';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useDebounced } from '@/hooks/use-debounced';
import { useWindowed } from '@/hooks/use-windowed';
import { useSessionUser } from '@/lib/session';
import { useDoctorPicker } from '@/hooks/use-doctor-picker';
import { useFormErrors } from '@/hooks/use-form-errors';
import { listAllTeamDoctors, type TeamDoctor } from '@/lib/added-doctors';
import { ApiError, NetworkError } from '@/lib/api';
import { withdrawRequest } from '@/lib/marketing';
import { formatRupees, rupeesToPaise } from '@/lib/money';
import { getRejectionReason } from '@/lib/planning';
import { downloadServicesReport, listServices, SERVICE_TYPE_LABEL, serviceStage, totalServices, type ServiceView } from '@/lib/services';
import { DownloadMenu } from '@/components/download-menu';
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

// What a new request can be (2026-11-19); the two older types only label old rows.
const TYPES: { value: DoctorServiceType; label: string }[] = (['HONORARIUM', 'CME', 'TRAINING', 'ONLINE_PROMOTION', 'OTHERS'] as const).map((value) => ({ value, label: SERVICE_TYPE_LABEL[value] }));
const TYPE_LABEL = SERVICE_TYPE_LABEL;

type ServiceRow = ServiceView;
type ServicePayload ={ doctorId: string; serviceType: DoctorServiceType; amountPaise: number; remarks: string | null };
type Msg = { tone: 'danger' | 'success' | 'info'; text: string };

/** The request form's fields top to bottom, so a failed send scrolls to the first one with a problem. */
const FIELD_ORDER = ['doctor', 'amount'];
const errorText =(err: unknown) =>
  err instanceof ApiError || err instanceof NetworkError || err instanceof Error ? err.message : 'Something went wrong. Please try again.';

/**
 * Doctor Services (PRD §6.2): ask for a service for one of your doctors — a tour package, a gift, an online
 * promotion or something else — with the amount. A manager may also pick a doctor of anyone in their team (2026-11-02).
 * The request goes to your own manager, or to Admin if you have none; one approval is enough. Requests are saved on
 * the phone and sent when there is a connection.
 */
export default function ServicesScreen() {
  const online = useOnline();
  const activity = useCachedSource<FieldActivitySnapshot>('fieldActivity');
  const master = useCachedSource<FieldMasterDataSnapshot>('fieldMasterData');
  const { records } = useRecords(['DOCTOR_SERVICE']);

  const [editing, setEditing] = useState<OutboxRecord | 'new' | null>(null);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [type, setType] = useState<DoctorServiceType>('HONORARIUM');
  const [amount, setAmount] = useState('');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg | null>(null);
  const fe = useFormErrors(FIELD_ORDER);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  // A manager may ask for a service for a doctor of anyone in their team too (docs/mobile/service-requests.md rule 1); an MR, only their own.
  const { isManager } = useCurrentUser();
  // Keyed by the manager flag (2026-11-27): a list cached before the flag arrived (empty) is never reused for a manager.
  const team = useCachedFetch<TeamDoctor[]>(`services-team-doctors:${isManager ? 'team' : 'none'}`, isManager ? listAllTeamDoctors : async () => []);
  const own = master.data?.doctors ?? [];
  const doctors = [
    ...own.map((d) => ({ id: d.id, name: d.name, subtitle: d.address, photoUrl: d.photoUrl })),
    ...(team.data ?? [])
      .filter((t) => !own.some((d) => d.id === t.id))
      .map((t) => ({ id: t.id, name: t.name, subtitle: t.assignedTo ? `${t.assignedTo.name} (${t.assignedTo.employeeCode})` : (t.clinicName ?? t.specialty), photoUrl: t.photoUrl })),
  ];
  const doctorName = (id: string) => doctors.find((d) => d.id === id)?.name ?? picker.find(id)?.name ?? 'Doctor';
  // The form's picker reads the server page by page as the employee types; the doctors above are its offline stand-in.
  const cachedOptions = [...doctors].sort((a, b) => a.name.localeCompare(b.name));
  const picker = useDoctorPicker(isManager, cachedOptions);
  const unsent = records.filter((r) => !r.deleted && r.status !== 'SYNCED').reverse();
  // The list from the server says whether each approved service was carried out; the offline snapshot is the fallback.
  const list = useCachedFetch<ServiceView[]>(`doctor-services:${isManager ? 'team' : 'mine'}`, () => listServices(isManager), records.filter((r) => r.status === 'SYNCED').length);
  const sent: ServiceRow[] = list.data ?? (activity.data?.doctorServices ?? []).map((s) => ({ ...s, approval: s.approvalRequestId ? { requestId: s.approvalRequestId, cycle: 0 } : null, doneAt: null, awaitingDone: false }));

  // One list, newest first, with one filter row (decision 2026-11-18). A manager's list holds their own requests and the team's.
  const me = useSessionUser();
  // A manager has two tabs: their own requests and the team's (decision 2026-11-18). An MR has only their own.
  // A manager lands on the team's requests (decision 2026-11-18); until they pick a tab themselves the default follows the role, which may load a moment late.
  const [picked, setTab] = useState<'MINE' | 'TEAM' | null>(null);
  const tab: 'MINE' | 'TEAM' = picked ?? (isManager ? 'TEAM' : 'MINE');
  const [filter, setFilter] = useState<'ALL' | 'WAITING' | 'TODO' | 'DONE' | 'REJECTED'>('ALL');
  const [search, setSearch] = useState('');
  // Requests, or one row per doctor with totals (decision-log 2026-11-19).
  const [view, setView] = useState<'REQUESTS' | 'DOCTORS'>('REQUESTS');
  const term = useDebounced(search.trim().toLowerCase(), 300);
  // Approved and not carried out = to do; waiting = still with the manager or Admin.
  const stageOf = (s: ServiceRow) => (s.doneAt ? 'DONE' : s.status === 'APPROVED' || s.status === 'MANAGER_APPROVED' ? 'TODO' : s.status === 'SUBMITTED' ? 'WAITING' : s.status === 'REJECTED' ? 'REJECTED' : 'OTHER');
  const ownerOf = (s: ServiceRow) => (!s.userId || !me || s.userId === me.id ? 'Own' : (s.userName ?? 'Team'));
  const shownSent = sent
    .filter((s) => (!isManager || (tab === 'MINE') === (ownerOf(s) === 'Own')))
    .filter((s) => (filter === 'ALL' || stageOf(s) === filter) && (!term || `${doctorName(s.doctorId)} ${TYPE_LABEL[s.serviceType]} ${s.userName ?? ''}`.toLowerCase().includes(term)))
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || b.id.localeCompare(a.id));
  const money = totalServices(shownSent, (s) => s.doctorName || doctorName(s.doctorId));
  const { visible } = useWindowed(shownSent, `${tab}|${filter}|${term}`);
  const waitingCount = sent.filter((s) => stageOf(s) === 'WAITING' && ownerOf(s) === 'Own').length + unsent.length;
  const toDoCount = sent.filter((s) => stageOf(s) === 'TODO').length;
  const doneCount = sent.filter((s) => stageOf(s) === 'DONE').length;

  const start = (record: OutboxRecord | 'new') => {
    setMsg(null);
    if (record === 'new') {
      setDoctorId(null);
      setType('HONORARIUM');
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
            : { tone: 'success', text: 'Sent for approval. Your manager or Admin decides.' },
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
        subtitle="Your manager or Admin approves it"
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
              label={isManager ? 'Doctor or MR' : 'Doctor'}
              options={picker.options}
              onSearch={picker.search}
              onEndReached={picker.more}
              loading={picker.loading}
              selectedOption={picker.find(doctorId)}
              searchPlaceholder={isManager ? 'Search a doctor or an MR' : 'Search a doctor'}
              value={doctorId}
              onChange={(id) => {
                setDoctorId(id);
                fe.clear('doctor');
              }}
              disabled={busy !== null}
              emptyText={isManager ? 'No doctors are assigned to you or your team yet.' : 'No doctors are assigned to you yet.'}
              searchable
              avatars
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
          <ThemedText type="smallBold" style={styles.sectionTitle}>{isManager && tab === 'TEAM' ? 'Team requests' : 'Your requests'}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{isManager ? (tab === 'TEAM' ? 'Your team’s, newest first' : 'Yours, newest first') : 'Newest first'}</ThemedText>
        </View>
        {isManager && tab === 'TEAM' ? null : <PrimaryButton label="+ Request" style={styles.newButton} onPress={() => start('new')} />}
      </View>

      {isManager ? (
        <ChoiceChips
          options={[
            { value: 'MINE', label: 'My requests' },
            { value: 'TEAM', label: 'Team requests' },
          ]}
          value={tab}
          onChange={setTab}
        />
      ) : null}
      <ChoiceChips
        options={[
          { value: 'ALL', label: 'All' },
          { value: 'WAITING', label: 'Waiting' },
          { value: 'TODO', label: 'Approved' },
          { value: 'DONE', label: 'Done' },
          { value: 'REJECTED', label: 'Rejected' },
        ]}
        value={filter}
        onChange={setFilter}
      />
      <TextField label={isManager ? 'Search a doctor, a type or an MR' : 'Search a doctor or a type'} value={search} onChangeText={setSearch} autoCapitalize="none" />
      <SummaryStrip
        items={[
          { label: 'Approved', value: formatRupees(money.totals.approvedPaise), accent: 'green' },
          { label: 'Waiting', value: formatRupees(money.totals.waitingPaise), accent: 'amber' },
          { label: 'Requests', value: money.totals.requests, accent: 'blue' },
        ]}
      />
      <ChoiceChips options={[{ value: 'REQUESTS', label: 'Requests' }, { value: 'DOCTORS', label: 'By doctor' }]} value={view} onChange={setView} />
      <DownloadMenu
        items={[
          {
            key: 'services',
            label: `Excel · ${isManager && tab === 'TEAM' ? 'my team’s' : 'my'} services`,
            hint: 'One row per doctor with totals by type, and every request',
            build: async () => ({ delivered: await downloadServicesReport(isManager && tab === 'TEAM') }),
          },
        ]}
      />
      {view === 'DOCTORS'
        ? money.doctors.length === 0
          ? <Notice tone="info">No approved or waiting requests here.</Notice>
          : money.doctors.map((d, i) => (
              <NumberedRow key={d.doctorId} n={i + 1}>
                <InfoCard>
                  <ThemedText type="smallBold">{d.doctorName}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">{`${d.requests} request${d.requests === 1 ? '' : 's'} · Approved ${formatRupees(d.approvedPaise)}${d.waitingPaise > 0 ? ` · Waiting ${formatRupees(d.waitingPaise)}` : ''}`}</ThemedText>
                </InfoCard>
              </NumberedRow>
            ))
        : null}

      {view === 'DOCTORS' ? [] : (isManager && tab === 'TEAM' ? [] : unsent).map((r) => {
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

      {view === 'DOCTORS' ? null : !activity.loaded && !list.data ? (
        <Notice tone="info">Loading…</Notice>
      ) : sent.length === 0 && unsent.length === 0 ? (
        <Notice tone="info">No service requests yet.</Notice>
      ) : (
        visible.map((s, i) => {
          const stage = s.origin === 'ADMIN' && !s.doneAt ? { text: 'Set up by Admin, to do', accent: 'blue' as const } : serviceStage(s);
          const requestId = s.approval?.requestId ?? null;
          return (
            <NumberedRow key={s.id} n={i + 1}>
            <InfoCard>
              <View style={styles.spread}>
                <IconChip icon={sym('briefcase', 'work')} accent="indigo" />
                <View style={styles.grow}>
                  <ThemedText type="smallBold" numberOfLines={1}>{`${s.doctorName || doctorName(s.doctorId)}${isManager && tab === 'TEAM' ? ` (${ownerOf(s)})` : ''}`}</ThemedText>
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
            </NumberedRow>
          );
        })
      )}
      {view === 'REQUESTS' && shownSent.length > 0 ? <ThemedText type="small" themeColor="textSecondary">{`Total ${shownSent.length}${term || filter !== 'ALL' ? ' found' : ''}`}</ThemedText> : null}
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
