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
export function doctorsCsv(doctors: readonly DoctorDto[], routeLabel: (routeId: string) => string): string {
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
      routeLabel(d.routeId),
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
