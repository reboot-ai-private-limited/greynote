import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { DateField, EMPTY_PARTS, isoFromParts, partsFromIso, type DateParts } from '@/components/date-field';
import { DoctorAvatar } from '@/components/doctor-avatar';
import { FyBanner } from '@/components/fy-banner';
import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { CardSection, InfoCard, Pill, PersonDropdown, sym } from '@/components/ui-cards';
import { Spacing } from '@/constants/theme';
import { useDayGate } from '@/hooks/use-day-gate';
import { useDebounced } from '@/hooks/use-debounced';
import { useOnEndReached } from '@/hooks/use-end-reached';
import { listTeamDoctors, updateDoctorTargets, type DoctorTargetsBody, type TeamDoctor } from '@/lib/added-doctors';
import { ApiError, NetworkError } from '@/lib/api';
import { useFinancialYear } from '@/lib/financial-year';
import { useOnline } from '@/offline';
import { useTeam } from '@/offline/team';

const errorText = (err: unknown) =>
  err instanceof ApiError || err instanceof NetworkError ? err.message : 'Something went wrong. Please try again.';

const NO_TARGET = 'NONE';
const FREQUENCIES = [...[1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) })), { value: NO_TARGET, label: 'No target' }];

/**
 * Team doctors (managers): pick someone in your team to see their doctors. "Set visit target" on a doctor sets how many times
 * a month they should visit (1–4, or none), plus the doctor's date of birth and anniversary. Only a manager above the employee, or Admin, may;
 * the server says so otherwise. Needs a connection and the current financial year.
 */
export default function TeamDoctorsScreen() {
  const online = useOnline();
  const fy = useFinancialYear();
  const { today } = useDayGate();
  const { team, loaded } = useTeam();

  const preset = useLocalSearchParams<{ userId?: string }>().userId;
  const [userId, setUserId] = useState<string | null>(typeof preset === 'string' && preset !== '' ? preset : null);
  const [search, setSearch] = useState('');
  const term = useDebounced(search, 300);
  const [doctors, setDoctors] = useState<TeamDoctor[] | null>(null);
  const [paging, setPaging] = useState({ page: 0, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TeamDoctor | null>(null);
  const [frequency, setFrequency] = useState<string | null>(null);
  const [birth, setBirth] = useState<DateParts>(EMPTY_PARTS);
  const [anniversary, setAnniversary] = useState<DateParts>(EMPTY_PARTS);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success' | 'info'; text: string } | null>(null);

  // No person chosen = the whole team. `page` 1 replaces the list; later pages add to it.
  const load = useCallback(
    async (page = 1) => {
      if (!online) return;
      setLoading(true);
      try {
        const res = await listTeamDoctors(userId, term.trim() || undefined, page);
        setDoctors((prev) => (page === 1 || !prev ? res.items : [...prev, ...res.items]));
        setPaging({ page: res.page, totalPages: res.totalPages, total: res.total });
        setLoadError(null);
      } catch (err) {
        setLoadError(errorText(err));
      } finally {
        setLoading(false);
      }
    },
    [userId, online, term],
  );

  const pickPerson = (id: string | null) => {
    setUserId(id);
    setDoctors(null);
    setEditing(null);
    setLoadError(null);
  };

  // Page 1 on open, and again when the person or the (debounced) search changes.
  useEffect(() => {
    const t = setTimeout(() => void load(1), 0);
    return () => clearTimeout(t);
  }, [load]);

  // Infinite scroll: near the bottom, the next 20.
  useOnEndReached(() => {
    if (online && !loading && doctors && paging.page < paging.totalPages) void load(paging.page + 1);
  });

  const open = (d: TeamDoctor) => {
    setMsg(null);
    setEditing(d);
    setFrequency(d.visitFrequency ? String(d.visitFrequency) : NO_TARGET);
    setBirth(partsFromIso(d.dateOfBirth));
    setAnniversary(partsFromIso(d.anniversary));
  };

  const save = async () => {
    if (!editing) return;
    const dob = isoFromParts(birth, today);
    if (dob.error) return setMsg({ tone: 'danger', text: `Date of birth: ${dob.error}` });
    const wedding = isoFromParts(anniversary, today);
    if (wedding.error) return setMsg({ tone: 'danger', text: `Anniversary: ${wedding.error}` });
    const newFrequency = frequency && frequency !== NO_TARGET ? Number(frequency) : null;

    // Only what changed goes up; the server refuses an empty change.
    const body: DoctorTargetsBody = {};
    if (newFrequency !== (editing.visitFrequency ?? null)) body.visitFrequency = newFrequency;
    if ((dob.iso ?? null) !== (editing.dateOfBirth ?? null)) body.dateOfBirth = dob.iso;
    if ((wedding.iso ?? null) !== (editing.anniversary ?? null)) body.anniversary = wedding.iso;
    if (Object.keys(body).length === 0) return setMsg({ tone: 'info', text: 'Nothing was changed.' });

    setBusy(true);
    setMsg(null);
    try {
      await updateDoctorTargets(editing.id, body);
      setMsg({ tone: 'success', text: `Saved for ${editing.name}.` });
      setEditing(null);
      void load(1);
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const readOnly = fy.isPast;

  return (
    <ScreenShell title="Doctors" subtitle="Your team’s doctors, and how often each is visited">
      <FyBanner />
      {!online ? <Notice tone="info">Connect to the internet to see and change your team’s doctors.</Notice> : null}
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

      <CardSection icon={sym('person.2', 'groups')} accent="blue" title="Employee" count={team.length || undefined}>
        {team.length === 0 ? (
          <Notice tone="info">{loaded ? 'You have nobody in your team yet.' : 'Loading your team…'}</Notice>
        ) : (
          <PersonDropdown
            people={team.map((t) => ({ id: t.id, name: t.name, detail: [t.employeeCode, t.designation].filter(Boolean).join(' · ') }))}
            value={userId}
            onChange={pickPerson}
            disabled={busy}
          />
        )}
        {userId ? <PrimaryButton label="Show the whole team" variant="text" disabled={busy} onPress={() => pickPerson(null)} style={styles.phone} /> : null}
      </CardSection>

      {editing ? (
        <CardSection icon={sym('target', 'track_changes')} accent="purple" title={editing.name}>
          <ThemedText type="small" themeColor="textSecondary">
            {[editing.specialty, editing.clinicName].filter(Boolean).join(' · ')}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Visits a month
          </ThemedText>
          <ChoiceChips options={FREQUENCIES} value={frequency} onChange={setFrequency} disabled={busy || readOnly} />
          <DateField label="Date of birth (optional)" value={birth} onChange={setBirth} disabled={busy || readOnly} />
          <DateField label="Anniversary (optional)" value={anniversary} onChange={setAnniversary} disabled={busy || readOnly} />
          <PrimaryButton label="Save" loading={busy} disabled={!online || readOnly} onPress={save} />
          <PrimaryButton label="Cancel" variant="text" disabled={busy} onPress={() => setEditing(null)} />
        </CardSection>
      ) : null}

      <TextField label="Search the doctor, or an MR’s name or code" value={search} onChangeText={setSearch} autoCapitalize="none" editable={online} />
      {loadError ? <Notice tone="danger">{loadError}</Notice> : null}
      {loading && !doctors ? <Skeleton cards={3} lines={2} /> : null}
      {doctors && doctors.length === 0 && !loading ? <Notice tone="info">{search.trim() ? 'No doctor matches that search.' : userId ? 'This employee has no doctors yet.' : 'Nobody in your team holds a doctor yet.'}</Notice> : null}
      {(doctors ?? []).map((d) => (
        <InfoCard key={d.id}>
          <View style={styles.row}>
            <DoctorAvatar name={d.name} photoUrl={d.photoUrl} />
            <View style={styles.grow}>
              <ThemedText type="smallBold">{d.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {[d.specialty, d.clinicName].filter(Boolean).join(' · ')}
              </ThemedText>
              {d.assignedTo ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {d.assignedTo.name} ({d.assignedTo.employeeCode})
                </ThemedText>
              ) : null}
            </View>
            <Pill text={d.visitFrequency ? `${d.visitFrequency} a month` : 'No target'} accent={d.visitFrequency ? 'green' : 'slate'} />
          </View>
          {d.routeNotHeld ? <Pill text="Route not held by this MR" accent="amber" /> : null}
          {d.phone ? <PrimaryButton label={d.phone} variant="text" onPress={() => void Linking.openURL(`tel:${d.phone}`)} style={styles.phone} /> : null}
          <PrimaryButton label="Set visit target →" variant="text" disabled={busy || readOnly} onPress={() => open(d)} style={styles.phone} />
        </InfoCard>
      ))}
      {doctors && doctors.length > 0 && loading ? <Skeleton cards={1} lines={2} /> : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1 },
  phone: { alignSelf: 'flex-start' },
});
