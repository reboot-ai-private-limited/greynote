import type { DoctorDto } from '@greynote/contracts';
import { toCsv } from '@/lib/csv';
import { DOCTOR_STATUS_LABEL } from './doctors';

export const DOCTORS_CSV_HEADER = [
  'Doctor',
  'Speciality',
  'Qualification',
  'Clinic',
  'Phone',
  'Email',
  'Address',
  'Route',
  'Status',
  'Visits per month',
  'Responsible MR',
  'Employee code',
  'Date of birth',
  'Anniversary',
] as const;

/** One doctor per row. `routeLabel` turns a route id into the name the screens show. */
/** `placeLabel` names where each doctor sits (2026-11-26: a place, not a route). */
export function doctorsCsv(doctors: readonly DoctorDto[], placeLabel: (doctor: DoctorDto) => string): string {
  return toCsv(
    DOCTORS_CSV_HEADER,
    doctors.map((d) => [
      d.name,
      d.specialty,
      d.qualification,
      d.clinicName,
      d.phone,
      d.email,
      d.address,
      placeLabel(d),
      DOCTOR_STATUS_LABEL[d.status],
      d.visitFrequency,
      d.assignedTo?.name,
      d.assignedTo?.employeeCode,
      d.dateOfBirth,
      d.anniversary,
    ]),
  );
}

export const doctorsFilename = (): string => 'doctors.csv';
