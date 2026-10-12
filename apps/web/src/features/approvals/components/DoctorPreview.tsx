'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { DoctorDetailsForm } from '@/features/field-master-data/components/DoctorDetailsForm';
import { Badge } from '@/components/ui/Badge';
import { Field, FieldList } from '@/components/ui/FieldList';
import { LocationMap } from '@/features/field-master-data/components/LocationMap';
import { useDoctor } from '@/features/field-master-data/hooks/useDoctors';
import { DOCTOR_STATUS_LABEL, DOCTOR_STATUS_TONE, locationWasCorrected } from '@/features/field-master-data/lib/doctors';
import { distanceMeters, formatDistance, formatPoint } from '@/features/field-master-data/lib/location';
import { useTerritoryDirectory } from '@/features/territory/hooks/useTerritoryDirectory';
import { PreviewFrame } from './PreviewFrame';

/** A doctor an MR added: its details, and the registered location beside where the phone was. */
export function DoctorPreview({ recordId }: { recordId: string }) {
  const query = useDoctor(recordId);
  const directory = useTerritoryDirectory();
  const doctor = query.data;
  const [editing, setEditing] = useState(false);

  return (
    <PreviewFrame title="New doctor" description="Added by an MR. Check the details and the location before approving." query={query}>
      {doctor ? (
        <div className="space-y-5 p-5">
          <FieldList>
            <Field label="Name">{doctor.name}</Field>
            <Field label="Specialty">{doctor.specialty}</Field>
            <Field label="Qualification">{doctor.qualification}</Field>
            <Field label="Route">{directory.routeLabel(doctor.routeId)}</Field>
            <Field label="Email">{doctor.email}</Field>
            <Field label="Clinic">{doctor.clinicName}</Field>
            <Field label="Phone">{doctor.phone}</Field>
            <Field label="Visits a month">{doctor.visitFrequency}</Field>
            <Field label="Address">{doctor.address}</Field>
            <Field label="Status">
              <Badge tone={DOCTOR_STATUS_TONE[doctor.status]}>{DOCTOR_STATUS_LABEL[doctor.status]}</Badge>
            </Field>
          </FieldList>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-text-subtle">Location</p>
            <p className="text-sm text-text">
              {doctor.capturedLocation && doctor.location
                ? locationWasCorrected(doctor)
                  ? `Corrected after the phone captured it: ${formatDistance(distanceMeters(doctor.capturedLocation, doctor.location))} from where the phone was (${formatPoint(doctor.capturedLocation)}).`
                  : `As the phone captured it: ${formatPoint(doctor.location)}.`
                : doctor.location
                  ? `Registered at ${formatPoint(doctor.location)}.`
                  : 'No location is set, so the geofence cannot check visits to this doctor.'}
            </p>
            {doctor.location || doctor.capturedLocation ? (
              <LocationMap point={doctor.location} captured={doctor.capturedLocation} disabled onPick={() => undefined} />
            ) : null}
            <p className="text-[13px] text-text-subtle">
              Blue is the registered location; grey is where the phone was.{' '}
              Correct any detail or the location below before you approve.
            </p>
          </div>

          {doctor.status === 'pending' ? (
            editing ? (
              <div className="space-y-3">
                <DoctorDetailsForm key={doctor.id} doctor={doctor} review />
                <Button variant="secondary" onClick={() => setEditing(false)}>
                  Close editor
                </Button>
              </div>
            ) : (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Edit before approving
              </Button>
            )
          ) : null}
        </div>
      ) : null}
    </PreviewFrame>
  );
}
