'use client';

import type { DoctorDto } from '@greynote/contracts';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useCreateDoctor, useUpdateDoctor } from '../hooks/useDoctors';
import { useActiveSpecialtyNames } from '../hooks/useSpecialties';
import { EMPTY_DOCTOR, buildDoctor, buildDoctorUpdate, doctorToDraft, type DoctorDraft } from '../lib/doctors';
import { LocationPicker } from './LocationPicker';
import { RoutePickerField } from './RoutePickerField';

/** Create (no `doctor`) or edit (`doctor`). Mounted per loaded record, so its draft starts from the latest data. */
export function DoctorDetailsForm({ doctor }: { doctor?: DoctorDto }) {
  const router = useRouter();
  const readOnly = useIsReadOnly();
  const { names, isLoading: specialtiesLoading } = useActiveSpecialtyNames();
  const [draft, setDraft] = useState<DoctorDraft>(doctor ? doctorToDraft(doctor) : EMPTY_DOCTOR);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreateDoctor((created) => router.push(`/doctors/${created.id}`));
  const update = useUpdateDoctor();
  const locked = readOnly || doctor?.status === 'inactive';
  const set = (field: keyof DoctorDraft) => (value: string) => setDraft((d) => ({ ...d, [field]: value }));
  const invalid = (field: string) => (errors[field] ? true : undefined);
  const pending = create.isPending || update.isPending;
  // An older doctor's free-text speciality may not be on the list: it stays selectable, marked, so opening the form does not blank it.
  const specialtyOptions = useMemo(() => {
    const options = names.map((n) => ({ value: n, label: n }));
    const current = doctor?.specialty;
    return current && !names.some((n) => n.toLowerCase() === current.toLowerCase()) ? [{ value: current, label: `${current} (not on the list)` }, ...options] : options;
  }, [names, doctor?.specialty]);

  function submit() {
    if (doctor) {
      const built = buildDoctorUpdate(doctor, draft);
      if (!built.ok) return setErrors(built.errors);
      setErrors({});
      if (Object.keys(built.body).length === 0) return;
      return update.mutate({ id: doctor.id, body: built.body });
    }
    const built = buildDoctor(draft);
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    create.mutate(built.body);
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-6"
    >
      <Card title="Details">
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <RoutePickerField
              id="doctor-route"
              value={draft.routeId}
              onChange={(routeId) => setDraft((d) => ({ ...d, routeId }))}
              error={errors['routeId']}
              disabled={locked}
              {...(doctor ? { hint: 'Changing the route hides this doctor from an MR who does not have the new one.' } : {})}
            />
          </div>
          <FormField label="Name" htmlFor="doctor-name" error={errors['name']}>
            <Input id="doctor-name" value={draft.name} disabled={locked} onChange={(e) => set('name')(e.target.value)} aria-invalid={invalid('name')} />
          </FormField>
          <FormField label="Speciality" htmlFor="doctor-specialty" error={errors['specialty']} hint="Chosen from Specialities; an Admin keeps that list.">
            <Select
              id="doctor-specialty"
              value={draft.specialty}
              onValueChange={set('specialty')}
              options={specialtyOptions}
              placeholder={specialtiesLoading ? 'Loading…' : 'Choose a speciality'}
              disabled={locked}
              aria-invalid={invalid('specialty')}
            />
          </FormField>
          <FormField label="Qualification" htmlFor="doctor-qualification" error={errors['qualification']}>
            <Input id="doctor-qualification" value={draft.qualification} disabled={locked} onChange={(e) => set('qualification')(e.target.value)} aria-invalid={invalid('qualification')} />
          </FormField>
          <FormField label="Email" htmlFor="doctor-email" error={errors['email']} hint="Optional.">
            <Input id="doctor-email" type="email" value={draft.email} disabled={locked} onChange={(e) => set('email')(e.target.value)} aria-invalid={invalid('email')} />
          </FormField>
          <FormField label="Address" htmlFor="doctor-address" error={errors['address']}>
            <Input id="doctor-address" value={draft.address} disabled={locked} onChange={(e) => set('address')(e.target.value)} aria-invalid={invalid('address')} />
          </FormField>
        </div>
      </Card>
      <Card
        title="Registered location"
        description="What a visit's geofence compares the MR's position against. Correcting it never changes where the phone was when the MR added the doctor."
      >
        <div className="p-5">
          <LocationPicker
            inputs={draft.coordinates}
            onChange={(coordinates) => setDraft((d) => ({ ...d, coordinates }))}
            errors={errors}
            captured={doctor?.capturedLocation}
            disabled={locked}
          />
        </div>
      </Card>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => router.push('/doctors')}>
          {doctor ? 'Back to doctors' : 'Cancel'}
        </Button>
        <Button type="submit" disabled={locked || pending} title={readOnly ? 'A past financial year is read-only' : undefined}>
          {pending ? 'Saving…' : doctor ? 'Save changes' : 'Create doctor'}
        </Button>
      </div>
    </form>
  );
}
