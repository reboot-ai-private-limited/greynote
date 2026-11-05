import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { FormField } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { OutletPicker } from '@/components/outlet-picker';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { CardSection, InfoCard, Pill, sym } from '@/components/ui-cards';
import { Spacing, type Accent } from '@/constants/theme';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useFormErrors } from '@/hooks/use-form-errors';
import { ADDED_EDITABLE } from '@/lib/added-doctors';
import { editAddedChemist, listAddedChemists, type AddedChemist } from '@/lib/added-chemists';
import { ApiError, NetworkError } from '@/lib/api';
import { captureLocation } from '@/lib/location';
import { MANAGER_NOT_ALLOWED, mayAddChemist } from '@/lib/manager-add-doctors';
import { getRejectionReason, withdrawPlan } from '@/lib/planning';
import { usePublicFlags } from '@/lib/public-config';
import {
  getNumberSetting,
  getRecord,
  refreshNow,
  removeRecord,
  saveCall,
  sendNewChemists,
  useOnline,
  useRecords,
  type NewChemistPayload,
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
const STATE_ACCENT: Record<string, Accent> = { SUBMITTED: 'amber', MANAGER_APPROVED: 'blue', APPROVED: 'green', REJECTED: 'red', WITHDRAWN: 'slate', REOPENED: 'slate' };

const FIELD_ORDER = ['route', 'name', 'address', 'phone'];
const PHONE = /^\+?\d{10,15}$/;
const PHONE_ERROR = 'Enter a phone number of 10 to 15 digits.';
const cleanPhone = (s: string) => s.replace(/[\s-]/g, '');

type Msg = { tone: 'danger' | 'success' | 'info' | 'warning'; text: string };
/** What the form is working on: a new chemist, one waiting on the phone, or one already with the server. */
type Target = 'new' | { local: OutboxRecord } | { server: AddedChemist };

/**
 * Chemists (docs/mobile/chemists.md): add a chemist who isn't on your list, with your phone's location as theirs — save it
 * while you're at the pharmacy. Your manager or Admin decides, either one, in one step. It works offline: it is kept on the
 * phone and sent when you're connected. Until approved the chemist can't be called on or ordered for. A manager may add
 * only while Admin allows it (`managerCanAddChemists`).
 */
export default function ChemistsScreen() {
  const online = useOnline();
  const { isManager } = useCurrentUser();
  const territory = useCachedSource<TerritorySnapshot>('territory');
  const master = useCachedSource<FieldMasterDataSnapshot>('fieldMasterData');
  const { records } = useRecords(['NEW_CHEMIST']);
  const canAdd = mayAddChemist(isManager, usePublicFlags());

  const [added, setAdded] = useState<AddedChemist[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  const [target, setTarget] = useState<Target | null>(null);
  const [routeId, setRouteId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const form = useFormErrors(FIELD_ORDER);

  const routes = useMemo(() => territory.data?.routes ?? [], [territory.data]);
  const routeName = useMemo(() => new Map(routes.map((r) => [r.id, r.name])), [routes]);
  const unsent = records.filter((r) => !r.deleted && r.status !== 'SYNCED');
  const hasDrafts = unsent.some((r) => r.status === 'DRAFT');
  const activeCount = master.data?.chemists.length;

  // A chemist the server has approved joins the phone's list at the next pull: pull now instead of waiting for it.
  const onList = useMemo(() => new Set((master.data?.chemists ?? []).map((c) => c.id)), [master.data]);
  const missing = (added ?? []).filter((c) => c.status === 'active' && !onList.has(c.id)).map((c) => c.id).join(',');
  const pulledFor = useRef('');
  useEffect(() => {
    if (!online || !missing || pulledFor.current === missing) return;
    pulledFor.current = missing;
    void refreshNow();
  }, [online, missing]);

  // Anything waiting on the phone goes up as soon as there is a connection.
  useEffect(() => {
    if (online && hasDrafts) void sendNewChemists().then(reload).catch(() => undefined);
  }, [online, hasDrafts]);

  // The chemists I added, with where each is in its approval (online).
  useEffect(() => {
    if (!online) return;
    let alive = true;
    (async () => {
      try {
        const list = await listAddedChemists();
        if (!alive) return;
        setAdded(list);
        setLoadError(null);
        for (const c of list) {
          if (c.approval?.status === 'REJECTED') {
            getRejectionReason(c.approval.requestId)
              .then((r) => alive && r && setReasons((prev) => ({ ...prev, [c.id]: r })))
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
    form.clearAll();
    if (t === 'new') {
      // No route is pre-picked unless there is only one: a chemist must not land on the wrong route unnoticed.
      setRouteId(routes.length === 1 ? routes[0]!.id : null);
      setName('');
      setAddress('');
      setPhone('');
    } else {
      const c = 'local' in t ? (t.local.payload as NewChemistPayload) : t.server;
      setRouteId(c.routeId);
      setName(c.name);
      setAddress(c.address);
      setPhone(c.phone ?? '');
    }
    setTarget(t);
  };

  const save = async () => {
    const problems: Record<string, string> = {};
    if (!routeId) problems.route = 'Choose the route this chemist is on.';
    if (!name.trim()) problems.name = 'Enter the chemist’s name.';
    if (!address.trim()) problems.address = 'Enter the chemist’s address.';
    if (phone.trim() && !PHONE.test(cleanPhone(phone))) problems.phone = PHONE_ERROR;
    if (Object.keys(problems).length > 0 || !routeId) {
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
        text: 'Your location is needed — it becomes the chemist’s location. Turn on location, allow it for this app, and stand at the chemist’s shop, then save again.',
      });
    }
    const limit = await getNumberSetting('GEO_MAX_ACCURACY_METERS');
    const weak = fix.accuracyMeters !== null && fix.accuracyMeters > limit;

    const payload = { routeId, name: name.trim(), address: address.trim(), phone: phone.trim() ? cleanPhone(phone) : null, location: fix.point };
    try {
      if (target && typeof target === 'object' && 'server' in target) {
        await editAddedChemist(target.server.id, payload);
        setTarget(null);
        setMsg({ tone: 'success', text: 'Sent again for approval.' });
        reload();
      } else {
        const existing = target && typeof target === 'object' && 'local' in target ? target.local : undefined;
        const record = await saveCall('NEW_CHEMIST', payload, existing);
        setTarget(null);
        if (!online) {
          setMsg({ tone: 'info', text: 'Saved on this phone. It will be sent when you’re online.' });
        } else {
          await sendNewChemists();
          const after = await getRecord(record.clientId);
          if (after?.status === 'FAILED') {
            setMsg({ tone: 'danger', text: failureText(after) });
          } else {
            setMsg({
              tone: weak ? 'warning' : 'success',
              text: weak
                ? 'Sent for approval, but your location reading was weak. Your manager or Admin can look at it before approving.'
                : 'Sent for approval. Your manager or Admin decides.',
            });
          }
          reload();
        }
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && err.data?.field === 'phone') {
        setMsg({ tone: 'danger', text: 'Fix the fields marked in red.' });
        form.fail({ phone: PHONE_ERROR });
      } else {
        setMsg({ tone: 'danger', text: errorText(err) });
      }
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

  const withdraw = async (c: AddedChemist) => {
    if (!c.approval) return;
    if (!online) return setMsg({ tone: 'info', text: 'You’re offline. Connect to the internet to withdraw.' });
    setBusy(true);
    try {
      await withdrawPlan(c.approval.requestId);
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
        title={target === 'new' ? 'Add chemist' : 'Change chemist'}
        subtitle="Your manager or Admin approves a new chemist"
        footer={
          <View style={styles.block}>
            <PrimaryButton label={typeof target === 'object' && 'server' in target ? 'Send again' : 'Save and send'} loading={busy} onPress={save} />
            <PrimaryButton label="Cancel" variant="text" disabled={busy} onPress={() => setTarget(null)} />
          </View>
        }>
        {!online ? <Notice tone="info">You’re offline. It will be kept on this phone and sent when you’re back online.</Notice> : null}
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <Notice tone="info">The chemist’s location is your phone’s position when you save, so save this while you’re at the chemist’s shop.</Notice>
        <CardSection icon={sym('signpost.right', 'route')} accent="blue" title="Route">
          {routes.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">Connect to the internet once so your routes can load.</ThemedText>
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
        <CardSection icon={sym('cross.case', 'local_pharmacy')} accent="green" title="Chemist">
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
        </CardSection>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title="Chemists" subtitle="Chemists you add go to approval" onRefresh={() => {
      reload();
      void refreshNow();
    }}>
      {!online ? <Notice tone="info">You’re offline. Chemists you add are kept on this phone and sent later.</Notice> : null}
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      <View style={styles.head}>
        <View style={styles.grow}>
          <ThemedText type="smallBold" style={styles.sectionTitle}>Your chemists</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{activeCount !== undefined ? `${activeCount} on your routes · added by you below` : 'Added by you'}</ThemedText>
        </View>
        {canAdd ? <PrimaryButton label="+ Add chemist" style={styles.newButton} onPress={() => start('new')} /> : null}
      </View>
      {!canAdd ? <Notice tone="info">Managers can’t add chemists right now. Ask Admin if you need to.</Notice> : null}

      {unsent.length > 0 ? (
        <>
          <ThemedText type="smallBold">Waiting on this phone</ThemedText>
          {unsent.map((r) => {
            const p = r.payload as NewChemistPayload;
            return (
              <InfoCard key={r.clientId}>
                <ThemedText type="smallBold">{p.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{routeName.get(p.routeId) ?? 'Route'}</ThemedText>
                <ThemedText type="small" themeColor={r.status === 'FAILED' ? 'danger' : 'textSecondary'}>
                  {r.status === 'FAILED' ? failureText(r) : online ? 'Sending…' : 'Saved on this phone — sends when you’re online'}
                </ThemedText>
                <View style={styles.actions}>
                  <PrimaryButton label="Edit" variant="text" disabled={busy || (r.errorCode === MANAGER_NOT_ALLOWED && !canAdd)} onPress={() => start({ local: r })} />
                  <PrimaryButton label="Remove" variant="text" disabled={busy} onPress={() => removeLocal(r)} />
                </View>
              </InfoCard>
            );
          })}
        </>
      ) : null}

      <ThemedText type="smallBold">Chemists you added</ThemedText>
      {loadError ? <Notice tone="danger">{loadError}</Notice> : null}
      {added === null && !loadError ? (
        online ? (
          <Skeleton cards={2} lines={2} />
        ) : (
          <ThemedText type="small" themeColor="textSecondary">Connect to the internet to see where your chemists are in approval.</ThemedText>
        )
      ) : null}
      {added !== null && added.length === 0 ? <Notice tone="info">You haven’t added any chemists yet.</Notice> : null}
      {(added ?? []).map((c) => {
        const state = c.status === 'active' ? 'APPROVED' : (c.approval?.status ?? 'SUBMITTED');
        const editable = ADDED_EDITABLE.includes(state);
        // One stage: the manager's or Admin's decision is final, so only a request still waiting can be withdrawn.
        const waiting = state === 'SUBMITTED';
        return (
          <InfoCard key={c.id}>
            <ThemedText type="smallBold">{c.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{[c.address, routeName.get(c.routeId) ?? 'Route'].filter(Boolean).join(' · ')}</ThemedText>
            {c.phone ? <PrimaryButton label={c.phone} variant="text" onPress={() => void Linking.openURL(`tel:${c.phone}`)} style={styles.phone} /> : null}
            <Pill text={state === 'APPROVED' && onList.has(c.id) ? 'Approved — on your list' : (APPROVAL_TEXT[state] ?? state)} accent={STATE_ACCENT[state] ?? 'slate'} />
            {reasons[c.id] ? <ThemedText type="small" themeColor="danger">{`“${reasons[c.id]}”`}</ThemedText> : null}
            {editable || waiting ? (
              <View style={styles.actions}>
                {editable ? <PrimaryButton label="Change" variant="text" disabled={busy} onPress={() => start({ server: c })} /> : null}
                {waiting ? <PrimaryButton label="Withdraw" variant="text" disabled={busy} onPress={() => withdraw(c)} /> : null}
              </View>
            ) : null}
          </InfoCard>
        );
      })}
    </ScreenShell>
  );
}

/** Why the server refused a queued add, in words (docs/mobile/chemists.md section 2). */
function failureText(r: OutboxRecord): string {
  switch (r.errorCode) {
    case MANAGER_NOT_ALLOWED:
      return 'Managers can’t add chemists right now. Ask Admin to allow it, then tap Edit and save again, or remove this one.';
    case 'ROUTE_NOT_ASSIGNED':
      return 'That route isn’t one of yours any more. Tap Edit and pick another route.';
    case 'ADDED_AT_THE_SAME_TIME':
      return 'It was added at the same time as another. Tap Edit, then save to send it again.';
    default:
      return r.errorMessage ?? 'The server did not accept this chemist.';
  }
}

const styles = StyleSheet.create({
  block: { gap: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1, gap: Spacing.one },
  sectionTitle: { fontSize: 18, lineHeight: 24 },
  newButton: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.two + 2 },
  actions: { flexDirection: 'row', gap: Spacing.two },
  phone: { alignSelf: 'flex-start' },
});
