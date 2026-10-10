import type { DoctorVisitMrDto } from '@greynote/contracts';
import { toCsv } from '@/lib/csv';

/** Share of the quota made, whole percent; `null` with no quota. */
export function progressPercent(m: Pick<DoctorVisitMrDto, 'quota' | 'made'>): number | null {
  return m.quota <= 0 ? null : Math.round((m.made / m.quota) * 100);
}

const HEADER = [
  'Employee code',
  'Employee',
  'Doctor',
  'Speciality',
  'Frequency',
  'Calls made',
  'Missed',
  'Planned days',
  'Planned, not called since',
] as const;

export function doctorVisitsCsv(mrs: readonly DoctorVisitMrDto[]): string {
  return toCsv(
    HEADER,
    mrs.flatMap((m) =>
      m.rows.map((r) => [
        m.mr.employeeCode,
        m.mr.name,
        r.doctor.name,
        r.doctor.specialty,
        r.frequency,
        r.made,
        r.missed,
        r.plannedDays,
        r.missedSince ?? '',
      ]),
    ),
  );
}

export const doctorVisitsFilename = (month: string): string => `doctor-visits-${month}.csv`;
