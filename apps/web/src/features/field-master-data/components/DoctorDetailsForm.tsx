'use client';

import type { DoctorDto } from '@greynote/contracts';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, FieldList } from '@/components/ui/FieldList';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { StepperItem } from '@/components/ui/Stepper';
import { WizardShell } from '@/components/ui/WizardShell';
import { Grid } from '@/components/ui/WizardParts';
import { useTerritoryDirectory } from '@/features/territory/hooks/useTerritoryDirectory';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useCreateDoctor, useReviewDoctor, useUpdateDoctor } from '../hooks/useDoctors';
import { useActiveSpecialtyNames } from '../hooks/useSpecialties';
import {
  DOCTOR_STEPS,
  DOCTOR_STEP_LABEL,
  EMPTY_DOCTOR,
  FREQUENCY_OPTIONS,
  buildDoctor,
  buildDoctorUpdate,
  doctorStepErrors,
  doctorToDraft,
  type DoctorDraft,
  type DoctorStep,
} from '../lib/doctors';
import { formatPoint, pointFromInputs } from '../lib/location';
import { LocationPicker } from './LocationPicker';
import { RoutePickerField } from './RoutePickerField';

const STEP_TITLE: Record<DoctorStep, string> = {
  details: 'Doctor details',
  location: 'Location (optional)',
  review: 'Review',
};

/**
 * Create (no `doctor`) or edit (`doctor`). Mounted per loaded record, so its draft starts from the latest data.
 * Adding walks the same shell as the employee wizard (Details, Location, Review); editing shows the two sections on one page.
 */
export function DoctorDetailsForm({ doctor, review = false }: { doctor?: DoctorDto; review?: boolean }) {
  const router = useRouter();
  const readOnly = useIsReadOnly();
  const { names, isLoading: specialtiesLoading } = useActiveSpecialtyNames();
  const [draft, setDraft] = useState<DoctorDraft>(doctor ? doctorToDraft(doctor) : EMPTY_DOCTOR);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreateDoctor((created) => router.push(`/doctors/${created.id}`));
  const adminUpdate = useUpdateDoctor();
  const reviewUpdate = useReviewDoctor();
  // `review`: a manager or Admin correcting a doctor in the approvals inbox, before approving it.
  const update = review ? reviewUpdate : adminUpdate;
  // An inactive doctor can still be corrected (decision-log 2026-10-22).
  const locked = readOnly;
  const set = (field: keyof DoctorDraft) => (value: string) =>
    setDraft((d) => ({ ...d, [field]: value }));
  const pending = create.isPending || update.isPending;
  const directory = useTerritoryDirectory();
  const [step, setStep] = useState<DoctorStep>('details');
  // Errors show for a step only once Next has been pressed on it, as in the employee wizard.
  const [tried, setTried] = useState<ReadonlySet<DoctorStep>>(new Set());
  const stepIndex = DOCTOR_STEPS.indexOf(step);
  // An older doctor's free-text speciality may not be on the list: it stays selectable, marked, so opening the form does not blank it.
  const specialtyOptions = useMemo(() => {
    const options = names.map((n) => ({ value: n, label: n }));
    const current = doctor?.specialty;
    return current && !names.some((n) => n.toLowerCase() === current.toLowerCase())
      ? [{ value: current, label: `${current} (not on the list)` }, ...options]
      : options;
  }, [names, doctor?.specialty]);

  const valid = (s: DoctorStep) => Object.keys(doctorStepErrors(draft, s)).length === 0;
  const items: StepperItem[] = DOCTOR_STEPS.map((s, i) => ({
    key: s,
    label: DOCTOR_STEP_LABEL[s],
    optional: s === 'location',
    done: i < stepIndex && valid(s),
    reachable: DOCTOR_STEPS.slice(0, i).every(valid),
  }));
  const shown = doctor ? errors : tried.has(step) ? doctorStepErrors(draft, step) : errors;

  function goTo(next: DoctorStep) {
    setStep(next);
    window.scrollTo({ top: 0 });
  }
  function nextStep() {
    if (!valid(step)) return setTried((t) => new Set(t).add(step));
    goTo(DOCTOR_STEPS[stepIndex + 1] ?? 'review');
  }

  function submit() {
    // Enter inside a step means "Next"; only the review step creates the doctor.
    if (!doctor && step !== 'review') return nextStep();
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

  const invalid = (field: string) => (shown[field] ? true : undefined);
  const detailsFields = (
    <Grid>
      <div className="sm:col-span-2">
        <RoutePickerField
          id="doctor-route"
          value={draft.routeId}
          onChange={(routeId) => setDraft((d) => ({ ...d, routeId }))}
          error={shown['routeId']}
          disabled={locked}
          {...(doctor && draft.routeId !== doctor.routeId
            ? { hint: 'This doctor will be hidden from an MR who does not have the new route.' }
            : {})}
        />
      </div>
      <FormField label="Name" htmlFor="doctor-name" error={shown['name']}>
        <Input
          id="doctor-name"
          value={draft.name}
          disabled={locked}
          onChange={(e) => set('name')(e.target.value)}
          aria-invalid={invalid('name')}
        />
      </FormField>
      <FormField label="Speciality" htmlFor="doctor-specialty" error={shown['specialty']}>
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
      <FormField
        label="Qualification"
        htmlFor="doctor-qualification"
        error={shown['qualification']}
      >
        <Input
          id="doctor-qualification"
          value={draft.qualification}
          disabled={locked}
          onChange={(e) => set('qualification')(e.target.value)}
          aria-invalid={invalid('qualification')}
        />
      </FormField>
      <FormField label="Email (optional)" htmlFor="doctor-email" error={shown['email']}>
        <Input
          id="doctor-email"
          type="email"
          value={draft.email}
          disabled={locked}
          onChange={(e) => set('email')(e.target.value)}
          aria-invalid={invalid('email')}
        />
      </FormField>
      <FormField label="Clinic name (optional)" htmlFor="doctor-clinic" error={shown['clinicName']}>
        <Input id="doctor-clinic" value={draft.clinicName} disabled={locked} onChange={(e) => set('clinicName')(e.target.value)} aria-invalid={invalid('clinicName')} />
      </FormField>
      <FormField label="Phone (optional)" htmlFor="doctor-phone" error={shown['phone']}>
        <Input id="doctor-phone" type="tel" inputMode="tel" value={draft.phone} disabled={locked} onChange={(e) => set('phone')(e.target.value)} aria-invalid={invalid('phone')} />
      </FormField>
      <FormField label="Date of birth (optional)" htmlFor="doctor-dob" error={shown['dateOfBirth']}>
        <Input id="doctor-dob" type="date" value={draft.dateOfBirth} disabled={locked} onChange={(e) => set('dateOfBirth')(e.target.value)} aria-invalid={invalid('dateOfBirth')} />
      </FormField>
      <FormField label="Anniversary (optional)" htmlFor="doctor-anniversary" error={shown['anniversary']}>
        <Input id="doctor-anniversary" type="date" value={draft.anniversary} disabled={locked} onChange={(e) => set('anniversary')(e.target.value)} aria-invalid={invalid('anniversary')} />
      </FormField>
      <FormField label="Visit frequency (optional)" htmlFor="doctor-frequency" hint="How many times the MR should visit this doctor each month. Missed visits are tracked against it.">
        <Select
          id="doctor-frequency"
          value={draft.visitFrequency || 'none'}
          onValueChange={(v) => set('visitFrequency')(v === 'none' ? '' : v)}
          options={[{ value: 'none', label: 'No target' }, ...FREQUENCY_OPTIONS]}
          disabled={locked}
        />
      </FormField>
      <div className="sm:col-span-2">
        <FormField label="Address" htmlFor="doctor-address" error={shown['address']}>
          <Input
            id="doctor-address"
            value={draft.address}
            disabled={locked}
            onChange={(e) => set('address')(e.target.value)}
            aria-invalid={invalid('address')}
          />
        </FormField>
      </div>
    </Grid>
  );
  const locationPicker = (
    <LocationPicker
      inputs={draft.coordinates}
      onChange={(coordinates) => setDraft((d) => ({ ...d, coordinates }))}
      errors={shown}
      captured={doctor?.capturedLocation}
      disabled={locked}
    />
  );

  if (doctor) {
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
          <div className="p-5">{detailsFields}</div>
        </Card>
        <Card title="Registered location">
          <div className="p-5">{locationPicker}</div>
        </Card>
        <div className="flex justify-between gap-3">
          {review ? <span /> : (
            <Button variant="secondary" onClick={() => router.push('/doctors')}>
              Back to doctors
            </Button>
          )}
          <Button
            type="submit"
            disabled={locked || pending}
            title={readOnly ? 'A past financial year is read-only' : undefined}
          >
            {pending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>
    );
  }

  const point = pointFromInputs(draft.coordinates);
  return (
    <WizardShell
      backHref="/doctors"
      backLabel="Doctors"
      title="New doctor"
      steps={items}
      current={step}
      onSelect={(key) => goTo(key as DoctorStep)}
      stepTitle={STEP_TITLE[step]}
      onSubmit={submit}
      onBack={() =>
        stepIndex > 0 ? goTo(DOCTOR_STEPS[stepIndex - 1] ?? 'details') : router.push('/doctors')
      }
      backText={stepIndex > 0 ? 'Back' : 'Cancel'}
      isLast={step === 'review'}
      createLabel="Create doctor"
      pending={pending}
      disabled={locked}
      disabledTitle={readOnly ? 'A past financial year is read-only' : undefined}
    >
      {step === 'details' ? detailsFields : null}
      {step === 'location' ? locationPicker : null}
      {step === 'review' ? (
        <FieldList>
          <Field label="Route">{draft.routeId ? directory.routeLabel(draft.routeId) : null}</Field>
          <Field label="Name">{draft.name}</Field>
          <Field label="Speciality">{draft.specialty}</Field>
          <Field label="Qualification">{draft.qualification}</Field>
          <Field label="Email">{draft.email || null}</Field>
          <Field label="Clinic">{draft.clinicName || null}</Field>
          <Field label="Phone">{draft.phone || null}</Field>
          <Field label="Date of birth">{draft.dateOfBirth || null}</Field>
          <Field label="Anniversary">{draft.anniversary || null}</Field>
          <Field label="Visit frequency">{draft.visitFrequency ? `${draft.visitFrequency} a month` : null}</Field>
          <Field label="Address">{draft.address}</Field>
          <Field label="Location">{point.ok ? formatPoint(point.point) : 'Not valid'}</Field>
        </FieldList>
      ) : null}
    </WizardShell>
  );
}
