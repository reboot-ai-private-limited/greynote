import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { DateField, EMPTY_PARTS, isoFromParts, partsFromIso, type DateParts } from '@/components/date-field';
import { FyBanner } from '@/components/fy-banner';
import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { CardSection, IconChip, InfoCard, Pill, PersonDropdown, sym } from '@/components/ui-cards';
import { Spacing } from '@/constants/theme';
import { useDayGate } from '@/hooks/use-day-gate';
import { listTeamDoctors, updateDoctorTargets, type DoctorTargetsBody, type TeamDoctor } from '@/lib/added-doctors';
import { ApiError, NetworkError } from '@/lib/api';
import { useFinancialYear } from '@/lib/financial-year';
import { useOnline } from '@/offline';
import { useTeam } from '@/offline/team';

const errorText = (err: unknown) =>
  err instanceof ApiError || err instanceof NetworkError ? err.message : 'Something went wrong. Please try again.';

const NO_TARGET = 'NONE';
const FREQUENCIES = [...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) })), { value: NO_TARGET, label: 'No target' }];

/**
 * Visit targets (managers): pick someone in your team, then a doctor of theirs, and set how many times a month they should
 * visit (1–5, or none), plus the doctor's date of birth and anniversary. Only a manager above the employee, or Admin, may;
 * the server says so otherwise. Needs a connection and the current financial year.
 */
export default function TeamDoctorsScreen() {
  const online = useOnline();
  const fy = useFinancialYear();
  const { today } = useDayGate();
  const { team, loaded } = useTeam();

  const [userId, setUserId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [doctors, setDoctors] = useState<TeamDoctor[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TeamDoctor | null>(null);
  const [frequency, setFrequency] = useState<string | null>(null);
  const [birth, setBirth] = useState<DateParts>(EMPTY_PARTS);
  const [anniversary, setAnniversary] = useState<DateParts>(EMPTY_PARTS);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success' | 'info'; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!userId || !online) return;
    setLoading(true);
    try {
      setDoctors(await listTeamDoctors(userId, search.trim() || undefined));
      setLoadError(null);
    } catch (err) {
      setLoadError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [userId, online, search]);

  const pickPerson = (id: string) => {
    setUserId(id);
    setDoctors(null);
    setEditing(null);
    setLoadError(null);
  };

  // Search waits a moment after typing stops.
  useEffect(() => {
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
  }, [load]);

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
      void load();
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const readOnly = fy.isPast;

  return (
    <ScreenShell title="Visit targets" subtitle="How often your team visits each doctor">
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

      {userId ? (
        <>
          <TextField label="Search the doctor’s name" value={search} onChangeText={setSearch} autoCapitalize="none" editable={online} />
          {loadError ? <Notice tone="danger">{loadError}</Notice> : null}
          {loading && !doctors ? <Skeleton cards={3} lines={2} /> : null}
          {doctors && doctors.length === 0 ? <Notice tone="info">{search.trim() ? 'No doctor matches that name.' : 'This employee has no doctors yet.'}</Notice> : null}
          {(doctors ?? []).map((d) => (
            <Pressable key={d.id} accessibilityRole="button" accessibilityLabel={`Set the visit target for ${d.name}`} disabled={busy || readOnly} onPress={() => open(d)}>
              <InfoCard>
                <View style={styles.row}>
                  <IconChip icon={sym('stethoscope', 'medical_services')} accent="teal" />
                  <View style={styles.grow}>
                    <ThemedText type="smallBold">{d.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {[d.specialty, d.clinicName].filter(Boolean).join(' · ')}
                    </ThemedText>
                  </View>
                  <Pill text={d.visitFrequency ? `${d.visitFrequency} a month` : 'No target'} accent={d.visitFrequency ? 'green' : 'slate'} />
                </View>
              </InfoCard>
            </Pressable>
          ))}
        </>
      ) : team.length > 0 ? (
        <Notice tone="info">Choose an employee to see their doctors.</Notice>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1 },
});
