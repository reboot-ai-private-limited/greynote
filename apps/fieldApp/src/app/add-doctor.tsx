import { useEffect, useMemo, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { DateField, EMPTY_PARTS, isoFromParts, partsFromIso, type DateParts } from '@/components/date-field';
import { FormField } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { OutletPicker } from '@/components/outlet-picker';
import { PrimaryButton } from '@/components/primary-button';
import { Skeleton } from '@/components/skeleton';
import { ScreenShell } from '@/components/screen-shell';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { CardSection, IconChip, InfoCard, Pill, sym } from '@/components/ui-cards';
import { Spacing, type Accent } from '@/constants/theme';
import { useDayGate } from '@/hooks/use-day-gate';
import { useFormErrors } from '@/hooks/use-form-errors';
import { ApiError, NetworkError } from '@/lib/api';
import { ADDED_EDITABLE, editAddedDoctor, listAddedDoctors, type AddedDoctor } from '@/lib/added-doctors';
import { captureLocation } from '@/lib/location';
import { getRejectionReason, withdrawPlan } from '@/lib/planning';
import {
  getNumberSetting,
  getRecord,
  removeRecord,
  saveCall,
  sendNewDoctors,
  useOnline,
  useRecords,
  type NewDoctorPayload,
  type OutboxRecord,
} from '@/offline';
import { useCachedSource } from '@/offline/cache';
import type { FieldMasterDataSnapshot, TerritorySnapshot } from '@/types/sync';

const errorText = (err: unknown) =>
  err instanceof ApiError || err instanceof NetworkError ? err.message : 'Something went wrong. Please try again.';

const APPROVAL_TEXT: Record<string, string> = {
  SUBMITTED: 'Waiting for your manager or Admin',
  MANAGER_APPROVED: 'Approved — it joins your list after the next sync',
  APPROVED: 'Approved — it joins your list after the next sync',
  REJECTED: 'Rejected — change it and send it again',
  WITHDRAWN: 'Withdrawn — change it and send it again',
  REOPENED: 'Reopened by Admin — change it and send it again',
};

/** The form's fields top to bottom, so a failed save scrolls to the first one with a problem. */
const FIELD_ORDER = ['route', 'name', 'address', 'specialty', 'qualification', 'phone', 'email', 'birth', 'anniversary'];
const EMAIL =/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** 10 to 15 digits, with an optional leading `+` (spaces and dashes are stripped before checking). */
const PHONE = /^\+?\d{10,15}$/;
const cleanPhone = (s: string) => s.replace(/[\s-]/g, '');

/** How many times a month the MR should visit this doctor: the server takes 1 to 4 (doctors.md rule 4). "No target" sends none. */
const NO_TARGET = 'NONE';
const FREQUENCIES = [...[1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) })), { value: NO_TARGET, label: 'No target' }];

type Msg = { tone: 'danger' | 'success' | 'info' | 'warning'; text: string };
/** What the form is working on: a new doctor, one waiting on the phone, or one already with the server. */
type Target = 'new' | { local: OutboxRecord } | { server: AddedDoctor };

/**
 * Add Doctor (PRD §6.2, docs/mobile/doctors.md): add a doctor who isn't on your list. There is no map: the doctor's location
 * is your phone's position when you save, so save it while you're there. Your manager or Admin decides — either one, in one
 * step — and may correct the details and location first. It works offline — it is kept on the phone and sent when you're
 * connected, and it doesn't wait for the day's report. Once approved the doctor joins your list. Works even while your
 * account is blocked.
 */
export default function AddDoctorScreen() {
  const online = useOnline();
  const { today } = useDayGate();
  const master = useCachedSource<FieldMasterDataSnapshot>('fieldMasterData');
  const territory = useCachedSource<TerritorySnapshot>('territory');
  const { records } = useRecords(['NEW_DOCTOR']);

  const [added, setAdded] = useState<AddedDoctor[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  const [target, setTarget] = useState<Target | null>(null);
  const [routeId, setRouteId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [specialty, setSpecialty] = useState<string | null>(null);
  const [qualification, setQualification] = useState('');
  const [email, setEmail] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [phone, setPhone] = useState('');
  const [birth, setBirth] = useState<DateParts>(EMPTY_PARTS);
  const [anniversary, setAnniversary] = useState<DateParts>(EMPTY_PARTS);
  const [frequency, setFrequency] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const form = useFormErrors(FIELD_ORDER);

  const routes = useMemo(() => territory.data?.routes ?? [], [territory.data]);
  const specialties = master.data?.specialties ?? [];
  const routeName = useMemo(() => new Map(routes.map((r) => [r.id, r.name])), [routes]);
  const unsent = records.filter((r) => !r.deleted && r.status !== 'SYNCED');
  const hasDrafts = unsent.some((r) => r.status === 'DRAFT');

  // Anything waiting on the phone goes up as soon as there is a connection.
  useEffect(() => {
    if (online && hasDrafts) void sendNewDoctors().then(reload).catch(() => undefined);
  }, [online, hasDrafts]);

  // The doctors I added, with where each is in its approval (online).
  useEffect(() => {
    if (!online) return;
    let alive = true;
    (async () => {
      try {
        const list = await listAddedDoctors();
        if (!alive) return;
        setAdded(list);
        setLoadError(null);
        for (const d of list) {
          if (d.approval?.status === 'REJECTED') {
            getRejectionReason(d.approval.requestId)
              .then((r) => alive && r && setReasons((prev) => ({ ...prev, [d.id]: r })))
              .catch(() => undefined);
          }
        }
      } catch (err) {
        if (alive) setLoadError(errorText(err));
      }
    })();
    return () => {
      alive = false;
    };
  }, [online, reloadKey, records.length]);

  const start = (t: Target) => {
    setMsg(null);
    if (t === 'new') {
      // No route is pre-picked unless there is only one: a doctor must not land on the wrong route unnoticed.
      setRouteId(routes.length === 1 ? routes[0]!.id : null);
      setName('');
      setAddress('');
      setSpecialty(null);
      setQualification('');
      setEmail('');
      setClinicName('');
      setPhone('');
      setBirth(EMPTY_PARTS);
      setAnniversary(EMPTY_PARTS);
      setFrequency(null);
    } else {
      const d = 'local' in t ? (t.local.payload as NewDoctorPayload) : t.server;
      setRouteId(d.routeId);
      setName(d.name);
      setAddress(d.address);
      setSpecialty(d.specialty);
      setQualification(d.qualification);
      setEmail(d.email ?? '');
      setClinicName(d.clinicName ?? '');
      setPhone(d.phone ?? '');
      setBirth(partsFromIso(d.dateOfBirth));
      setAnniversary(partsFromIso(d.anniversary));
      // An older doctor may still carry 5 or 6; the server now takes 1–4, so it has to be picked again.
      setFrequency(d.visitFrequency && d.visitFrequency <= 4 ? String(d.visitFrequency) : null);
    }
    setTarget(t);
  };

  const save = async () => {
    const dob = isoFromParts(birth, today);
    const wedding = isoFromParts(anniversary, today);
    const problems: Record<string, string> = {};
    if (!routeId) problems.route = 'Choose the route this doctor is on.';
    if (!name.trim()) problems.name = 'Enter the doctor’s name.';
    if (!address.trim()) problems.address = 'Enter the doctor’s address.';
    if (!specialty) problems.specialty = 'Choose the speciality.';
    if (!qualification.trim()) problems.qualification = 'Enter the qualification.';
    if (phone.trim() && !PHONE.test(cleanPhone(phone))) problems.phone = 'Enter a phone number of 10 to 15 digits.';
    if (email.trim() && !EMAIL.test(email.trim())) problems.email = 'That email doesn’t look right.';
    if (dob.error) problems.birth = dob.error;
    if (wedding.error) problems.anniversary = wedding.error;
    if (Object.keys(problems).length > 0 || !routeId || !specialty) {
      setMsg({ tone: 'danger', text: 'Fix the fields marked in red.' });
      return form.fail(problems);
    }
    form.clearAll();
    if (target && typeof target === 'object' && 'server' in target && !online) {
      return setMsg({ tone: 'info', text: 'You’re offline. Connect to the internet to send this again.' });
    }

    setBusy(true);
    setMsg({ tone: 'info', text: 'Getting your location…' });
    const fix = await captureLocation();
    if (!fix) {
      setBusy(false);
      return setMsg({
        tone: 'danger',
        text: 'Your location is needed — it becomes the doctor’s location. Turn on location, allow it for this app, and stand at the doctor’s place, then save again.',
      });
    }
    const limit = await getNumberSetting('GEO_MAX_ACCURACY_METERS');
    const weak = fix.accuracyMeters !== null && fix.accuracyMeters > limit;

    const payload: NewDoctorPayload = {
      routeId,
      name: name.trim(),
      address: address.trim(),
      specialty,
      qualification: qualification.trim(),
      email: email.trim() || null,
      clinicName: clinicName.trim() || null,
      phone: phone.trim() ? cleanPhone(phone) : null,
      dateOfBirth: dob.iso,
      anniversary: wedding.iso,
      visitFrequency: frequency && frequency !== NO_TARGET ? Number(frequency) : null,
      location: fix.point,
    };
    try {
      if (target && typeof target === 'object' && 'server' in target) {
        await editAddedDoctor(target.server.id, payload);
        setTarget(null);
        setMsg({ tone: 'success', text: 'Sent again for approval.' });
        reload();
      } else {
        const existing = target && typeof target === 'object' && 'local' in target ? target.local : undefined;
        const record = await saveCall('NEW_DOCTOR', payload, existing);
        setTarget(null);
        if (!online) {
          setMsg({ tone: 'info', text: 'Saved on this phone. It will be sent when you’re online.' });
        } else {
          await sendNewDoctors();
          const after = await getRecord(record.clientId);
          if (after?.status === 'FAILED') {
            setMsg({ tone: 'danger', text: after.errorMessage ?? 'The server did not accept this doctor.' });
          } else {
            setMsg({
              tone: weak ? 'warning' : 'success',
              text: weak
                ? 'Sent for approval, but your location reading was weak. Your manager or Admin can correct it before approving.'
                : 'Sent for approval. Your manager or Admin decides.',
            });
          }
          reload();
        }
      }
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const removeLocal = async (r: OutboxRecord) => {
    try {
      await removeRecord(r.clientId);
    } catch (err) {
      setMsg({ tone: 'danger', text: err instanceof Error ? err.message : 'Could not remove it.' });
    }
  };

  const withdraw = async (d: AddedDoctor) => {
    if (!d.approval) return;
    if (!online) return setMsg({ tone: 'info', text: 'You’re offline. Connect to the internet to withdraw.' });
    setBusy(true);
    try {
      await withdrawPlan(d.approval.requestId);
      setMsg({ tone: 'success', text: 'Withdrawn.' });
      reload();
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  if (target) {
    return (
      <ScreenShell
        title={target === 'new' ? 'Add doctor' : 'Change doctor'}
        subtitle="Your manager or Admin approves a new doctor"
        footer={
          <View style={styles.block}>
            <PrimaryButton label={typeof target === 'object' && 'server' in target ? 'Send again' : 'Save and send'} loading={busy} onPress={save} />
            <PrimaryButton label="Cancel" variant="text" disabled={busy} onPress={() => setTarget(null)} />
          </View>
        }>
        {!online ? <Notice tone="info">You’re offline. It will be kept on this phone and sent when you’re back online.</Notice> : null}
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <Notice tone="info">
          The doctor’s location is your phone’s position when you save, so save this while you’re at the doctor’s place.
        </Notice>
        <CardSection icon={sym('signpost.right', 'route')} accent="blue" title="Route">
          {routes.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Connect to the internet once so your routes can load.
            </ThemedText>
          ) : (
            <FormField form={form} name="route">
              <OutletPicker
                label="Route"
                options={[...routes].sort((a, b) => a.name.localeCompare(b.name)).map((r) => ({ id: r.id, name: r.name, subtitle: r.hqName }))}
                value={routeId}
                onChange={(v) => {
                  setRouteId(v);
                  form.clear('route');
                }}
                disabled={busy}
                emptyText="Connect to the internet once so your routes can load."
              />
            </FormField>
          )}
        </CardSection>
        <CardSection icon={sym('stethoscope', 'medical_services')} accent="teal" title="Doctor">
          <FormField form={form} name="name" outline={false}>
            <TextField
              label="Name"
              value={name}
              onChangeText={(v) => {
                setName(v);
                form.clear('name');
              }}
              error={form.errors.name}
              editable={!busy}
              maxLength={150}
            />
          </FormField>
          <FormField form={form} name="address" outline={false}>
            <TextField
              label="Address"
              value={address}
              onChangeText={(v) => {
                setAddress(v);
                form.clear('address');
              }}
              error={form.errors.address}
              multiline
              editable={!busy}
              maxLength={500}
            />
          </FormField>
          <FormField form={form} name="specialty">
            <OutletPicker
              label="Speciality"
              options={specialties.map((s) => ({ id: s, name: s }))}
              value={specialty}
              onChange={(v) => {
                setSpecialty(v);
                form.clear('specialty');
              }}
              disabled={busy}
              emptyText="Connect to the internet once so the speciality list can load."
            />
          </FormField>
          <FormField form={form} name="qualification" outline={false}>
            <TextField
              label="Qualification"
              value={qualification}
              onChangeText={(v) => {
                setQualification(v);
                form.clear('qualification');
              }}
              error={form.errors.qualification}
              editable={!busy}
              maxLength={150}
            />
          </FormField>
          <TextField label="Clinic or hospital (optional)" value={clinicName} onChangeText={setClinicName} editable={!busy} maxLength={150} />
        </CardSection>
        <CardSection icon={sym('phone', 'call')} accent="green" title="Contact (optional)">
          <FormField form={form} name="phone" outline={false}>
            <TextField
              label="Phone (optional)"
              value={phone}
              onChangeText={(v) => {
                setPhone(v);
                form.clear('phone');
              }}
              error={form.errors.phone}
              keyboardType="phone-pad"
              placeholder="10 to 15 digits"
              editable={!busy}
              maxLength={20}
            />
          </FormField>
          <FormField form={form} name="email" outline={false}>
            <TextField
              label="Email (optional)"
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                form.clear('email');
              }}
              error={form.errors.email}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
            />
          </FormField>
          <FormField form={form} name="birth" outline={false}>
            <DateField
              label="Date of birth (optional)"
              value={birth}
              onChange={(v) => {
                setBirth(v);
                form.clear('birth');
              }}
              error={form.errors.birth}
              disabled={busy}
            />
          </FormField>
          <FormField form={form} name="anniversary" outline={false}>
            <DateField
              label="Anniversary (optional)"
              value={anniversary}
              onChange={(v) => {
                setAnniversary(v);
                form.clear('anniversary');
              }}
              error={form.errors.anniversary}
              disabled={busy}
            />
          </FormField>
        </CardSection>
        <CardSection icon={sym('repeat', 'repeat')} accent="purple" title="Visits a month (optional)">
          <ThemedText type="small" themeColor="textSecondary">
            How many times you should visit this doctor each month (1 to 4). Missed Calls counts against it; with no target the doctor isn’t tracked.
          </ThemedText>
          <ChoiceChips options={FREQUENCIES} value={frequency ?? NO_TARGET} onChange={(v) => setFrequency(v === NO_TARGET ? null : v)} disabled={busy} />
        </CardSection>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title="Add Doctor" subtitle="Doctors you add go to approval">
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      <View style={styles.head}>
        <View style={styles.grow}>
          <ThemedText type="smallBold" style={styles.sectionTitle}>Your doctors</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Added by you</ThemedText>
        </View>
        <PrimaryButton label="+ Add doctor" style={styles.newButton} onPress={() => start('new')} />
      </View>

      {unsent.length > 0 ? (
        <>
          <ThemedText type="smallBold">Waiting on this phone</ThemedText>
          {unsent.map((r) => {
            const p = r.payload as NewDoctorPayload;
            return (
              <InfoCard key={r.clientId}>
                <View style={styles.head}>
                  <IconChip icon={sym('stethoscope', 'medical_services')} accent="slate" />
                  <View style={styles.grow}>
                    <ThemedText type="smallBold">{p.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {`${p.specialty} · ${routeName.get(p.routeId) ?? 'Route'}`}
                    </ThemedText>
                  </View>
                </View>
                <ThemedText type="small" themeColor={r.status === 'FAILED' ? 'danger' : 'textSecondary'}>
                  {r.status === 'FAILED' ? 'Not accepted' : online ? 'Sending…' : 'Saved on this phone — sends when you’re online'}
                </ThemedText>
                {r.status === 'FAILED' && r.errorMessage ? (
                  <ThemedText type="small" themeColor="danger">
                    {r.errorMessage}
                  </ThemedText>
                ) : null}
                <View style={styles.actions}>
                  <PrimaryButton label="Edit" variant="text" disabled={busy} onPress={() => start({ local: r })} />
                  <PrimaryButton label="Remove" variant="text" disabled={busy} onPress={() => removeLocal(r)} />
                </View>
              </InfoCard>
            );
          })}
        </>
      ) : null}

      <ThemedText type="smallBold">Doctors you added</ThemedText>
      {loadError ? <Notice tone="danger">{loadError}</Notice> : null}
      {added === null && !loadError ? (
        online ? (
          <Skeleton cards={2} lines={2} />
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            Connect to the internet to see where your doctors are in approval.
          </ThemedText>
        )
      ) : null}
      {added !== null && added.length === 0 ? <Notice tone="info">You haven’t added any doctors yet.</Notice> : null}
      {(added ?? []).map((d) => {
        const state = d.status === 'active' ? 'APPROVED' : (d.approval?.status ?? 'SUBMITTED');
        const editable = ADDED_EDITABLE.includes(state);
        // One stage: the manager's or Admin's decision is final, so only a request still waiting can be withdrawn.
        const waiting = state === 'SUBMITTED';
        return (
          <InfoCard key={d.id}>
            <View style={styles.head}>
              <IconChip icon={sym('stethoscope', 'medical_services')} accent={STATE_ACCENT[state] ?? 'slate'} />
              <View style={styles.grow}>
                <ThemedText type="smallBold">{d.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {[d.specialty, d.clinicName, routeName.get(d.routeId) ?? 'Route'].filter(Boolean).join(' · ')}
                </ThemedText>
              </View>
            </View>
            {d.phone ? <PrimaryButton label={d.phone} variant="text" onPress={() => void Linking.openURL(`tel:${d.phone}`)} style={styles.phone} /> : null}
            <Pill text={APPROVAL_TEXT[state] ?? state} accent={STATE_ACCENT[state] ?? 'slate'} />
            {reasons[d.id] ? (
              <ThemedText type="small" themeColor="danger">
                {`“${reasons[d.id]}”`}
              </ThemedText>
            ) : null}
            {editable || waiting ? (
              <View style={styles.actions}>
                {editable ? <PrimaryButton label="Change" variant="text" disabled={busy} onPress={() => start({ server: d })} /> : null}
                {waiting ? <PrimaryButton label="Withdraw" variant="text" disabled={busy} onPress={() => withdraw(d)} /> : null}
              </View>
            ) : null}
          </InfoCard>
        );
      })}
    </ScreenShell>
  );
}

const STATE_ACCENT: Record<string, Accent> = { SUBMITTED: 'amber', MANAGER_APPROVED: 'blue', APPROVED: 'green', REJECTED: 'red', WITHDRAWN: 'slate', REOPENED: 'slate', DRAFT: 'slate' };

const styles = StyleSheet.create({
  block: { gap: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1, gap: Spacing.one },
  sectionTitle: { fontSize: 18, lineHeight: 24 },
  newButton: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.two + 2 },
  actions: { flexDirection: 'row', gap: Spacing.two },
  phone: { alignSelf: 'flex-start' },
});
