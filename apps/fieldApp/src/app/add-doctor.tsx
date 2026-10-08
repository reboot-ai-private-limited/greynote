import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { Notice } from '@/components/notice';
import { OutletPicker } from '@/components/outlet-picker';
import { PrimaryButton } from '@/components/primary-button';
import { Skeleton } from '@/components/skeleton';
import { ScreenShell } from '@/components/screen-shell';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
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
  SUBMITTED: 'Waiting for your manager',
  MANAGER_APPROVED: 'Approved by your manager — waiting for Admin',
  APPROVED: 'Approved — it joins your list after the next sync',
  REJECTED: 'Rejected — change it and send it again',
  WITHDRAWN: 'Withdrawn — change it and send it again',
  REOPENED: 'Reopened by Admin — change it and send it again',
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Msg = { tone: 'danger' | 'success' | 'info' | 'warning'; text: string };
/** What the form is working on: a new doctor, one waiting on the phone, or one already with the server. */
type Target = 'new' | { local: OutboxRecord } | { server: AddedDoctor };

/**
 * Add Doctor (PRD §6.2): add a doctor who isn't on your list. There is no map: the doctor's location is
 * your phone's position when you save, so save it while you're there. It goes to your manager, then Admin
 * (a manager's goes to their manager, then Admin; Admin adds directly in the web portal). It works offline —
 * it is kept on the phone and sent when you're connected, and it doesn't wait for the day's report. Once
 * approved the doctor joins your list. Works even while your account is blocked.
 */
export default function AddDoctorScreen() {
  const online = useOnline();
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
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);

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
      setRouteId(routes[0]?.id ?? null);
      setName('');
      setAddress('');
      setSpecialty(null);
      setQualification('');
      setEmail('');
    } else {
      const d = 'local' in t ? (t.local.payload as NewDoctorPayload) : t.server;
      setRouteId(d.routeId);
      setName(d.name);
      setAddress(d.address);
      setSpecialty(d.specialty);
      setQualification(d.qualification);
      setEmail(d.email ?? '');
    }
    setTarget(t);
  };

  const save = async () => {
    if (!routeId) return setMsg({ tone: 'danger', text: 'Choose the route this doctor is on.' });
    if (!name.trim()) return setMsg({ tone: 'danger', text: 'Enter the doctor’s name.' });
    if (!address.trim()) return setMsg({ tone: 'danger', text: 'Enter the doctor’s address.' });
    if (!specialty) return setMsg({ tone: 'danger', text: 'Choose the speciality.' });
    if (!qualification.trim()) return setMsg({ tone: 'danger', text: 'Enter the qualification.' });
    if (email.trim() && !EMAIL.test(email.trim())) return setMsg({ tone: 'danger', text: 'That email doesn’t look right.' });
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
                ? 'Sent for approval, but your location reading was weak. Admin sees it on a map and can correct it.'
                : 'Sent for approval. Your manager decides first, then Admin.',
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
      <ScreenShell title={target === 'new' ? 'Add doctor' : 'Change doctor'}>
        <View style={styles.block}>
          <ThemedText type="smallBold">Route</ThemedText>
          {routes.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Connect to the internet once so your routes can load.
            </ThemedText>
          ) : (
            <ChoiceChips options={routes.map((r) => ({ value: r.id, label: r.name }))} value={routeId} onChange={setRouteId} disabled={busy} />
          )}
        </View>
        <TextField label="Name" value={name} onChangeText={setName} editable={!busy} maxLength={150} />
        <TextField label="Address" value={address} onChangeText={setAddress} multiline editable={!busy} maxLength={500} />
        <OutletPicker
          label="Speciality"
          options={specialties.map((s) => ({ id: s, name: s }))}
          value={specialty}
          onChange={setSpecialty}
          disabled={busy}
          emptyText="Connect to the internet once so the speciality list can load."
        />
        <TextField label="Qualification" value={qualification} onChangeText={setQualification} editable={!busy} maxLength={150} />
        <TextField
          label="Email (optional)"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
        />
        <Notice tone="info">
          The doctor’s location is your phone’s position when you save, so save this while you’re at the doctor’s place.
        </Notice>
        {!online ? <Notice tone="info">You’re offline. It will be kept on this phone and sent when you’re back online.</Notice> : null}
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <PrimaryButton label={typeof target === 'object' && 'server' in target ? 'Send again' : 'Save and send'} loading={busy} onPress={save} />
        <PrimaryButton label="Cancel" variant="text" disabled={busy} onPress={() => setTarget(null)} />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title="Add Doctor">
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      <PrimaryButton label="Add a doctor" onPress={() => start('new')} />

      {unsent.length > 0 ? (
        <>
          <ThemedText type="smallBold">Waiting on this phone</ThemedText>
          {unsent.map((r) => {
            const p = r.payload as NewDoctorPayload;
            return (
              <ThemedView key={r.clientId} type="backgroundElement" style={styles.card}>
                <ThemedText type="smallBold">{p.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {`${p.specialty} · ${routeName.get(p.routeId) ?? 'Route'}`}
                </ThemedText>
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
              </ThemedView>
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
        const waiting = state === 'SUBMITTED' || state === 'MANAGER_APPROVED';
        return (
          <ThemedView key={d.id} type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">{d.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {`${d.specialty} · ${routeName.get(d.routeId) ?? 'Route'}`}
            </ThemedText>
            <ThemedText type="small" themeColor={state === 'REJECTED' ? 'danger' : 'textSecondary'}>
              {APPROVAL_TEXT[state] ?? state}
            </ThemedText>
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
          </ThemedView>
        );
      })}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  block: { gap: Spacing.two },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
  actions: { flexDirection: 'row', gap: Spacing.two },
});
