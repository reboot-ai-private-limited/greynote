import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { DoctorAvatar } from '@/components/doctor-avatar';
import { NumberedRow } from '@/components/numbered-row';
import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { TextField } from '@/components/text-field';
import { outletPlaceId, placeName } from '@/lib/places';
import { ThemedText } from '@/components/themed-text';
import { InfoCard, Pill } from '@/components/ui-cards';
import { Spacing } from '@/constants/theme';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useDebounced } from '@/hooks/use-debounced';
import { useOnEndReached } from '@/hooks/use-end-reached';
import { listAddedDoctors, type AddedDoctor } from '@/lib/added-doctors';
import { MANAGER_NOT_ALLOWED, mayAddDoctor } from '@/lib/manager-add-doctors';
import { usePublicFlags } from '@/lib/public-config';
import { useOnline, useRecords, type NewDoctorPayload } from '@/offline';
import { useCachedSource } from '@/offline/cache';
import { useCachedFetch } from '@/offline/cached-fetch';
import TeamDoctorsScreen from './team-doctors';
import type { FieldMasterDataSnapshot, TerritorySnapshot } from '@/types/sync';

const STATE_TEXT: Record<string, string> = {
  SUBMITTED: 'Waiting for approval',
  MANAGER_APPROVED: 'Waiting for approval',
  REJECTED: 'Rejected — change it and send it again',
  WITHDRAWN: 'Withdrawn — change it and send it again',
  REOPENED: 'Reopened — change it and send it again',
};

const matches = (term: string, ...parts: (string | null | undefined)[]) => !term || parts.some((p) => p?.toLowerCase().includes(term));

const PAGE = 20;

/**
 * Doctors. An MR sees ONE list (docs/mobile/doctors.md): every doctor assigned to them, with the ones they added that are not approved yet at
 * the top, tagged in red ("Pending", or why it came back). No headings to tell them apart. It reads the sync snapshot, so it works offline;
 * the statuses of added doctors come from the server when online. Search filters the phone's own list (after a 300 ms pause), and the list
 * shows 20 at a time, adding 20 as you scroll. A manager sees their team's doctors instead (team-doctors.tsx), and cannot add.
 */
export default function DoctorsScreen() {
  const { isManager } = useCurrentUser();
  return isManager ? <TeamDoctorsScreen /> : <MyDoctorsScreen />;
}

function MyDoctorsScreen() {
  const online = useOnline();
  const master = useCachedSource<FieldMasterDataSnapshot>('fieldMasterData');
  const territory = useCachedSource<TerritorySnapshot>('territory');
  const { records } = useRecords(['NEW_DOCTOR']);
  const added = useCachedFetch<AddedDoctor[]>('doctors-added', listAddedDoctors, records.filter((r) => r.status === 'SYNCED').length);
  const [search, setSearch] = useState('');
  const term = useDebounced(search.trim().toLowerCase(), 300);
  const [shown, setShown] = useState({ term: '', count: PAGE });
  const count = shown.term === term ? shown.count : PAGE; // a new search starts from the first 20 again

  const whereOf = (r: { placeId?: string | null; routeId?: string | null }) => placeName(outletPlaceId(r, territory.data), territory.data);
  // Doctors I added and that are not active yet. Offline, the snapshot's pending ones stand in, with where each request stands.
  const notActive: { id: string; name: string; photoUrl?: string | null; specialty: string; clinicName?: string | null; placeId?: string | null; routeId?: string | null; state: string }[] = added.data
    ? added.data.filter((d) => d.status !== 'active').map((d) => ({ ...d, state: d.approval?.status ?? 'SUBMITTED' }))
    : (master.data?.pendingDoctors ?? []).map((d) => ({ ...d, state: d.state ?? 'SUBMITTED' }));
  const unsent = records.filter((r) => !r.deleted && r.status !== 'SYNCED');
  // Back from Add Doctor (a withdraw or a change), read where each request stands again (2026-11-27).
  const focused = useRef(false);
  const { reload: reloadAdded } = added;
  useFocusEffect(
    useCallback(() => {
      if (focused.current && online) reloadAdded();
      focused.current = true;
    }, [reloadAdded, online]),
  );

  const canAdd = mayAddDoctor(false, usePublicFlags());
  const loading = !master.loaded;

  // One list: pending first (they need attention), then the rest A to Z.
  const rows: { key: string; pending: boolean; name: string; node: ReactNode }[] = [];
  for (const r of unsent) {
    const p = r.payload as NewDoctorPayload;
    if (!matches(term, p.name)) continue;
    const refused = r.errorCode === MANAGER_NOT_ALLOWED;
    rows.push({
      key: r.clientId,
      pending: true,
      name: p.name,
      node: (
        <InfoCard key={r.clientId}>
          <View style={styles.row}>
            <DoctorAvatar name={p.name} />
            <View style={styles.grow}>
              <ThemedText type="smallBold">{p.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{[p.specialty, whereOf(p)].filter(Boolean).join(' · ')}</ThemedText>
            </View>
            <Pill text="Pending" accent="red" />
          </View>
          <ThemedText type="small" themeColor={r.status === 'FAILED' ? 'danger' : 'textSecondary'}>
            {r.status === 'FAILED'
              ? refused
                ? 'Not accepted: managers can’t add doctors. Ask Admin to allow it, or remove this one.'
                : (r.errorMessage ?? 'Not accepted')
              : online
                ? 'Sending…'
                : 'Saved on this phone — sends when you’re online'}
          </ThemedText>
        </InfoCard>
      ),
    });
  }
  for (const d of notActive) {
    if (!matches(term, d.name, d.clinicName, d.specialty)) continue;
    const waiting = d.state === 'SUBMITTED' || d.state === 'MANAGER_APPROVED';
    rows.push({
      key: d.id,
      pending: true,
      name: d.name,
      // A tap opens it (2026-11-28): its form when it can be changed, otherwise where it can be withdrawn; Delete is there too.
      node: (
        <Pressable key={d.id} accessibilityRole="button" accessibilityHint={waiting ? 'Opens it, to withdraw' : 'Opens it, to change or delete'} onPress={() => router.push({ pathname: '/add-doctor', params: { edit: d.id } })}>
          <InfoCard>
            <View style={styles.row}>
              <DoctorAvatar name={d.name} photoUrl={d.photoUrl} />
              <View style={styles.grow}>
                <ThemedText type="smallBold">{d.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {[d.specialty, d.clinicName, whereOf(d)].filter(Boolean).join(' · ')}
                </ThemedText>
              </View>
              <Pill text={waiting ? 'Pending' : 'Not approved'} accent="red" />
            </View>
            <ThemedText type="small" themeColor={waiting ? 'textSecondary' : 'danger'}>{STATE_TEXT[d.state] ?? d.state}</ThemedText>
            <ThemedText type="small" themeColor="primary">{waiting ? 'Tap to withdraw it →' : 'Tap to change or delete it →'}</ThemedText>
          </InfoCard>
        </Pressable>
      ),
    });
  }
  for (const d of master.data?.doctors ?? []) {
    if (!matches(term, d.name, d.clinicName, d.specialty, d.phone)) continue;
    rows.push({
      key: d.id,
      pending: false,
      name: d.name,
      node: (
        <InfoCard key={d.id}>
          <View style={styles.row}>
            <DoctorAvatar name={d.name} photoUrl={d.photoUrl} />
            <View style={styles.grow}>
              <ThemedText type="smallBold">{d.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {[d.specialty, d.clinicName, whereOf(d)].filter(Boolean).join(' · ')}
              </ThemedText>
            </View>
            <Pill text={d.visitFrequency ? `${d.visitFrequency} a month` : 'No target'} accent={d.visitFrequency ? 'green' : 'slate'} />
          </View>
          {d.phone ? <PrimaryButton label={d.phone} variant="text" onPress={() => void Linking.openURL(`tel:${d.phone}`)} style={styles.phone} /> : null}
        </InfoCard>
      ),
    });
  }
  rows.sort((a, b) => Number(b.pending) - Number(a.pending) || a.name.localeCompare(b.name));
  const visible = rows.slice(0, count);
  const pendingCount = rows.filter((r) => r.pending).length;

  // Infinite scroll over what is already on the phone: 20 more at a time.
  useOnEndReached(() => {
    if (visible.length < rows.length) setShown({ term, count: count + PAGE });
  });

  return (
    <ScreenShell title="Doctors" subtitle="Your doctors, and the ones you added" onRefresh={added.reload} refreshing={added.refreshing}>
      {!online ? <Notice tone="info">You’re offline. Showing the doctors saved on this phone.</Notice> : null}
      {added.error && online ? <Notice tone="danger">{added.error}</Notice> : null}

      <View style={styles.head}>
        <View style={styles.grow}>
          <ThemedText type="smallBold" style={styles.sectionTitle}>Doctors</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{master.data ? `${master.data.doctors.length} assigned to you${pendingCount ? ` · ${pendingCount} pending` : ''}` : 'Assigned to you'}</ThemedText>
        </View>
        {canAdd ? <PrimaryButton label="+ Add doctor" style={styles.newButton} onPress={() => router.push({ pathname: '/add-doctor', params: { new: '1' } })} /> : null}
      </View>

      <TextField label="Search by name, clinic, speciality or phone" value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} />

      {loading ? <Skeleton cards={3} lines={2} /> : null}
      {master.loaded && !master.data ? <Notice tone="info">Connect to the internet once so your doctors can load.</Notice> : null}
      {master.data && rows.length === 0 ? <Notice tone="info">{term ? 'No doctor matches that search.' : 'No doctors are assigned to you yet.'}</Notice> : null}
      {rows.length > 0 ? <ThemedText type="small" themeColor="textSecondary">{`Total ${rows.length} doctors${term ? ' found' : ''}`}</ThemedText> : null}
      {visible.map((r, i) => (
        <NumberedRow key={r.key} n={i + 1}>
          {r.node}
        </NumberedRow>
      ))}

      {pendingCount > 0 ? <PrimaryButton label="Change or withdraw a doctor I added →" variant="text" onPress={() => router.push('/add-doctor')} /> : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1, gap: 2 },
  sectionTitle: { fontSize: 18, lineHeight: 24 },
  newButton: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.two + 2 },
  phone: { alignSelf: 'flex-start' },
});
