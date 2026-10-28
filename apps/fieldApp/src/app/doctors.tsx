import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { DoctorAvatar } from '@/components/doctor-avatar';
import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { InfoCard, Pill, SummaryStrip } from '@/components/ui-cards';
import { Spacing, type Accent } from '@/constants/theme';
import { useCurrentUser } from '@/hooks/use-current-user';
import { listAddedDoctors, type AddedDoctor } from '@/lib/added-doctors';
import { MANAGER_NOT_ALLOWED, mayAddDoctor } from '@/lib/manager-add-doctors';
import { useOnline, useRecords, type NewDoctorPayload } from '@/offline';
import { useCachedSource } from '@/offline/cache';
import { useCachedFetch } from '@/offline/cached-fetch';
import type { ConfigSnapshot, FieldMasterDataSnapshot, TerritorySnapshot } from '@/types/sync';

const STATE_TEXT: Record<string, string> = {
  SUBMITTED: 'Waiting for approval',
  MANAGER_APPROVED: 'Waiting for approval',
  REJECTED: 'Rejected — change it and send it again',
  WITHDRAWN: 'Withdrawn — change it and send it again',
  REOPENED: 'Reopened — change it and send it again',
};
const STATE_ACCENT: Record<string, Accent> = { SUBMITTED: 'amber', MANAGER_APPROVED: 'amber', REJECTED: 'red', WITHDRAWN: 'slate', REOPENED: 'slate' };

const matches = (term: string, ...parts: (string | null | undefined)[]) => !term || parts.some((p) => p?.toLowerCase().includes(term));

/**
 * Doctors (docs/mobile/doctors.md, field-app-gaps.md section D): every doctor assigned to me, then the ones I added that
 * are still waiting or were sent back, then anything saved on this phone. Reads the sync snapshot, so it works offline;
 * the statuses of added doctors come from the server when online. "+ Add doctor" opens the add screen. A manager sees
 * their own doctors the same way, and may add one only while Admin allows it.
 */
export default function DoctorsScreen() {
  const online = useOnline();
  const { isManager } = useCurrentUser();
  const master = useCachedSource<FieldMasterDataSnapshot>('fieldMasterData');
  const territory = useCachedSource<TerritorySnapshot>('territory');
  const config = useCachedSource<ConfigSnapshot>('config');
  const { records } = useRecords(['NEW_DOCTOR']);
  const added = useCachedFetch<AddedDoctor[]>('doctors-added', listAddedDoctors, records.filter((r) => r.status === 'SYNCED').length);
  const [search, setSearch] = useState('');
  const term = search.trim().toLowerCase();

  const routeName = useMemo(() => new Map((territory.data?.routes ?? []).map((r) => [r.id, r.name])), [territory.data]);
  const mine = (master.data?.doctors ?? []).filter((d) => matches(term, d.name, d.clinicName, d.specialty, d.phone));
  // Doctors I added and that are not active yet. Offline, the snapshot's pending ones stand in (all "waiting").
  const notActive: { id: string; name: string; photoUrl?: string | null; specialty: string; clinicName?: string | null; routeId: string; state: string }[] = added.data
    ? added.data.filter((d) => d.status !== 'active').map((d) => ({ ...d, state: d.approval?.status ?? 'SUBMITTED' }))
    : (master.data?.pendingDoctors ?? []).map((d) => ({ ...d, state: 'SUBMITTED' }));
  const pending = notActive.filter((d) => matches(term, d.name, d.clinicName, d.specialty));
  const unsent = records.filter((r) => !r.deleted && r.status !== 'SYNCED').filter((r) => matches(term, (r.payload as NewDoctorPayload).name));

  const canAdd = mayAddDoctor(isManager, config.data);
  const loading = !master.loaded;

  return (
    <ScreenShell title="Doctors" subtitle={isManager ? 'Doctors assigned to you' : 'Your doctors and the ones you added'} onRefresh={added.reload} refreshing={added.refreshing}>
      {!online ? <Notice tone="info">You’re offline. Showing the doctors saved on this phone.</Notice> : null}
      {added.error && online ? <Notice tone="danger">{added.error}</Notice> : null}

      <View style={styles.head}>
        <View style={styles.grow}>
          <ThemedText type="smallBold" style={styles.sectionTitle}>Your doctors</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Assigned to you</ThemedText>
        </View>
        {canAdd ? <PrimaryButton label="+ Add doctor" style={styles.newButton} onPress={() => router.push({ pathname: '/add-doctor', params: { new: '1' } })} /> : null}
      </View>
      {!canAdd ? <Notice tone="info">Managers can’t add doctors right now. Ask Admin if you need to.</Notice> : null}

      <TextField label="Search by name, clinic, speciality or phone" value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} />
      {master.data ? (
        <SummaryStrip
          items={[
            { label: 'Doctors', value: master.data.doctors.length, accent: 'teal' },
            { label: 'Waiting', value: notActive.length + unsent.length, accent: 'amber' },
          ]}
        />
      ) : null}

      {loading ? <Skeleton cards={3} lines={2} /> : null}
      {master.loaded && !master.data ? <Notice tone="info">Connect to the internet once so your doctors can load.</Notice> : null}
      {master.data && mine.length === 0 ? <Notice tone="info">{term ? 'No doctor matches that search.' : 'No doctors are assigned to you yet.'}</Notice> : null}
      {mine.map((d) => (
        <InfoCard key={d.id}>
          <View style={styles.row}>
            <DoctorAvatar name={d.name} photoUrl={d.photoUrl} />
            <View style={styles.grow}>
              <ThemedText type="smallBold">{d.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {[d.specialty, d.clinicName, routeName.get(d.routeId)].filter(Boolean).join(' · ')}
              </ThemedText>
            </View>
            <Pill text={d.visitFrequency ? `${d.visitFrequency} a month` : 'No target'} accent={d.visitFrequency ? 'green' : 'slate'} />
          </View>
          {d.phone ? <PrimaryButton label={d.phone} variant="text" onPress={() => void Linking.openURL(`tel:${d.phone}`)} style={styles.phone} /> : null}
        </InfoCard>
      ))}

      {pending.length > 0 || unsent.length > 0 ? <ThemedText type="smallBold">Added by you</ThemedText> : null}
      {unsent.map((r) => {
        const p = r.payload as NewDoctorPayload;
        const refused = r.errorCode === MANAGER_NOT_ALLOWED;
        return (
          <InfoCard key={r.clientId}>
            <View style={styles.row}>
              <DoctorAvatar name={p.name} />
              <View style={styles.grow}>
                <ThemedText type="smallBold">{p.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{[p.specialty, routeName.get(p.routeId)].filter(Boolean).join(' · ')}</ThemedText>
              </View>
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
        );
      })}
      {pending.map((d) => (
        <InfoCard key={d.id}>
          <View style={styles.row}>
            <DoctorAvatar name={d.name} photoUrl={d.photoUrl} />
            <View style={styles.grow}>
              <ThemedText type="smallBold">{d.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {[d.specialty, d.clinicName, routeName.get(d.routeId)].filter(Boolean).join(' · ')}
              </ThemedText>
            </View>
          </View>
          <Pill text={STATE_TEXT[d.state] ?? d.state} accent={STATE_ACCENT[d.state] ?? 'slate'} />
        </InfoCard>
      ))}
      {pending.length > 0 || unsent.length > 0 ? (
        <PrimaryButton label="Change or withdraw a doctor I added →" variant="text" onPress={() => router.push('/add-doctor')} />
      ) : null}
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
