import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DateField, EMPTY_PARTS, isoFromParts, partsFromIso, type DateParts } from '@/components/date-field';
import { ChoiceChips } from '@/components/choice-chips';
import { Notice } from '@/components/notice';
import { OutletPicker } from '@/components/outlet-picker';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { CardSection, sym } from '@/components/ui-cards';
import { Spacing } from '@/constants/theme';
import { useDayGate } from '@/hooks/use-day-gate';
import { reviewDoctor, type ReviewDoctorBody } from '@/lib/added-doctors';
import { ApiError, NetworkError } from '@/lib/api';
import { getDoctorRecord, type DoctorRecord } from '@/lib/approvals';
import { captureLocation } from '@/lib/location';
import { useOnline } from '@/offline';
import { useCachedSource } from '@/offline/cache';
import type { FieldMasterDataSnapshot } from '@/types/sync';

const errorText = (err: unknown) =>
  err instanceof ApiError || err instanceof NetworkError ? err.message : 'Something went wrong. Please try again.';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?\d{10,15}$/;
const cleanPhone = (s: string) => s.replace(/[\s-]/g, '');
const NO_TARGET = 'NONE';
const FREQUENCIES = [...[1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) })), { value: NO_TARGET, label: 'No target' }];

const sameDay = (a: string | null | undefined, b: string | null) => (a ?? null) === b;
const coordinate = (text: string, limit: number): number | null => {
  const n = Number(text.trim());
  return text.trim() !== '' && Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
};

/**
 * Correct a new doctor before deciding (docs/mobile/doctors.md rule 7): the manager or Admin who is about to approve may fix
 * any detail and the doctor's location. Only what you change is sent. The route stays as the employee chose it (the phone
 * cannot list another employee's routes). Opened from the request; online only. The server refuses it once the doctor is no
 * longer waiting, and says so.
 */
export default function ReviewDoctorScreen() {
  const { id, who } = useLocalSearchParams<{ id: string; who?: string }>();
  const online = useOnline();
  const { today } = useDayGate();
  const master = useCachedSource<FieldMasterDataSnapshot>('fieldMasterData');
  const specialties = master.data?.specialties ?? [];

  const [doctor, setDoctor] = useState<DoctorRecord | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [specialty, setSpecialty] = useState<string | null>(null);
  const [qualification, setQualification] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [frequency, setFrequency] = useState<string | null>(null);
  const [birth, setBirth] = useState<DateParts>(EMPTY_PARTS);
  const [anniversary, setAnniversary] = useState<DateParts>(EMPTY_PARTS);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success' | 'info' | 'warning'; text: string } | null>(null);

  useEffect(() => {
    if (!id || !online) return;
    let alive = true;
    getDoctorRecord(id)
      .then((d) => {
        if (!alive) return;
        setDoctor(d);
        setName(d.name);
        setAddress(d.address);
        setSpecialty(d.specialty);
        setQualification(d.qualification);
        setClinicName(d.clinicName ?? '');
        setPhone(d.phone ?? '');
        setEmail(d.email ?? '');
        setFrequency(d.visitFrequency ? String(d.visitFrequency) : NO_TARGET);
        setBirth(partsFromIso(d.dateOfBirth));
        setAnniversary(partsFromIso(d.anniversary));
        const where = d.location ?? d.capturedLocation;
        setLatitude(where ? String(where.latitude) : '');
        setLongitude(where ? String(where.longitude) : '');
        setLoadError(null);
      })
      .catch((err) => alive && setLoadError(errorText(err)));
    return () => {
      alive = false;
    };
  }, [id, online]);

  const useMyLocation = async () => {
    setMsg({ tone: 'info', text: 'Getting your location…' });
    const fix = await captureLocation();
    if (!fix) return setMsg({ tone: 'danger', text: 'Could not get your location. Turn on location and allow it for this app, or type the coordinates.' });
    setLatitude(String(fix.point.latitude));
    setLongitude(String(fix.point.longitude));
    setMsg(null);
  };

  const save = async () => {
    if (!doctor) return;
    if (!name.trim()) return setMsg({ tone: 'danger', text: 'Enter the doctor’s name.' });
    if (!address.trim()) return setMsg({ tone: 'danger', text: 'Enter the doctor’s address.' });
    if (!specialty) return setMsg({ tone: 'danger', text: 'Choose the speciality.' });
    if (!qualification.trim()) return setMsg({ tone: 'danger', text: 'Enter the qualification.' });
    if (email.trim() && !EMAIL.test(email.trim())) return setMsg({ tone: 'danger', text: 'That email doesn’t look right.' });
    if (phone.trim() && !PHONE.test(cleanPhone(phone))) return setMsg({ tone: 'danger', text: 'Enter a phone number of 10 to 15 digits.' });
    const dob = isoFromParts(birth, today);
    if (dob.error) return setMsg({ tone: 'danger', text: `Date of birth: ${dob.error}` });
    const wedding = isoFromParts(anniversary, today);
    if (wedding.error) return setMsg({ tone: 'danger', text: `Anniversary: ${wedding.error}` });
    const lat = coordinate(latitude, 90);
    const lng = coordinate(longitude, 180);
    if ((latitude.trim() || longitude.trim()) && (lat === null || lng === null)) {
      return setMsg({ tone: 'danger', text: 'Enter the location as a latitude (−90 to 90) and a longitude (−180 to 180), or leave both empty.' });
    }

    // Only what changed goes up; the server refuses an empty change.
    const body: ReviewDoctorBody = {};
    if (name.trim() !== doctor.name) body.name = name.trim();
    if (address.trim() !== doctor.address) body.address = address.trim();
    if (specialty !== doctor.specialty) body.specialty = specialty;
    if (qualification.trim() !== doctor.qualification) body.qualification = qualification.trim();
    if ((clinicName.trim() || null) !== (doctor.clinicName ?? null)) body.clinicName = clinicName.trim() || null;
    const newPhone = phone.trim() ? cleanPhone(phone) : null;
    if (newPhone !== (doctor.phone ?? null)) body.phone = newPhone;
    if ((email.trim() || null) !== (doctor.email ?? null)) body.email = email.trim() || null;
    if (!sameDay(doctor.dateOfBirth, dob.iso)) body.dateOfBirth = dob.iso;
    if (!sameDay(doctor.anniversary, wedding.iso)) body.anniversary = wedding.iso;
    const newFrequency = frequency && frequency !== NO_TARGET ? Number(frequency) : null;
    if (newFrequency !== (doctor.visitFrequency ?? null)) body.visitFrequency = newFrequency;
    const was = doctor.location ?? doctor.capturedLocation;
    if (lat !== null && lng !== null && (!was || was.latitude !== lat || was.longitude !== lng)) body.location = { latitude: lat, longitude: lng };
    if (Object.keys(body).length === 0) return setMsg({ tone: 'info', text: 'Nothing was changed.' });

    setBusy(true);
    setMsg(null);
    try {
      await reviewDoctor(doctor.id, body);
      router.back();
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenShell
      title="Correct doctor"
      subtitle={who ? `Added by ${who}` : 'Before you decide'}
      footer={
        doctor ? (
          <View style={styles.block}>
            <PrimaryButton label="Save corrections" loading={busy} disabled={!online} onPress={save} />
            <PrimaryButton label="Cancel" variant="text" disabled={busy} onPress={() => router.back()} />
          </View>
        ) : undefined
      }>
      {!online ? <Notice tone="info">You’re offline. Connect to the internet to correct this doctor.</Notice> : null}
      {loadError ? <Notice tone="danger">{loadError}</Notice> : null}
      {online && !doctor && !loadError ? <Skeleton cards={2} lines={4} /> : null}
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      {doctor ? (
        <>
          <Notice tone="info">Change only what is wrong, then approve or reject the request as usual. The route stays as the employee chose it.</Notice>
          <CardSection icon={sym('stethoscope', 'medical_services')} accent="teal" title="Doctor">
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
            <TextField label="Clinic or hospital (optional)" value={clinicName} onChangeText={setClinicName} editable={!busy} maxLength={150} />
            <TextField label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" editable={!busy} maxLength={20} />
            <TextField label="Email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" editable={!busy} maxLength={150} />
          </CardSection>
          <CardSection icon={sym('calendar', 'event')} accent="purple" title="Visits and dates">
            <ThemedText type="small" themeColor="textSecondary">
              Visits a month
            </ThemedText>
            <ChoiceChips options={FREQUENCIES} value={frequency} onChange={setFrequency} disabled={busy} />
            <DateField label="Date of birth (optional)" value={birth} onChange={setBirth} disabled={busy} />
            <DateField label="Anniversary (optional)" value={anniversary} onChange={setAnniversary} disabled={busy} />
          </CardSection>
          <CardSection icon={sym('mappin.and.ellipse', 'location_on')} accent="blue" title="Location">
            <ThemedText type="small" themeColor="textSecondary">
              Where the phone was when the doctor was added is filled in. Change it if the doctor is somewhere else.
            </ThemedText>
            <TextField label="Latitude" value={latitude} onChangeText={setLatitude} keyboardType="numbers-and-punctuation" autoCapitalize="none" editable={!busy} />
            <TextField label="Longitude" value={longitude} onChangeText={setLongitude} keyboardType="numbers-and-punctuation" autoCapitalize="none" editable={!busy} />
            <PrimaryButton label="Use my current location" variant="text" disabled={busy} onPress={useMyLocation} />
          </CardSection>
        </>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  block: { gap: Spacing.one },
});
