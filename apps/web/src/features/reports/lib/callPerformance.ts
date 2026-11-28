import type { CallPerformanceReportDto, CallPerformanceRowDto, MissedDoctorDto } from '@greynote/contracts';

/** A percentage for a cell or tile: "94%", or "—" when there is nothing to divide by. */
export const pctText = (v: number | null): string => (v === null ? '—' : `${v}%`);
/** A call average: "9.4", or "—" with no working day. */
export const avgText = (v: number | null): string => (v === null ? '—' : v.toFixed(1));

export const CALL_PERFORMANCE_HEADER = [
  'Employee',
  'Code',
  'Designation',
  'Coverage of',
  'Working days',
  'Field days',
  'Doctor calls',
  'Doctor call avg',
  'Chemist calls',
  'Chemist call avg',
  'Doctors held',
  'Met',
  'Coverage %',
  'Met fully',
  'With frequency',
  'Frequency coverage %',
  'Visits owed',
  'Visits made',
  'Visit compliance %',
  'Never met',
] as const;

const num = (v: number | null) => (v === null ? '' : v);

/** One row per employee, then the totals (the MRs' own figures): the same cells for the Excel and the CSV. */
export function callPerformanceRows(report: CallPerformanceReportDto): Array<Array<string | number>> {
  const row = (name: string, code: string, designation: string, scope: string, r: Omit<CallPerformanceRowDto, 'employee' | 'isManager' | 'scope'>) => [
    name,
    code,
    designation,
    scope,
    r.workingDays ?? '',
    r.fieldDays,
    r.doctorCalls,
    num(r.doctorCallAvg),
    r.chemistCalls,
    num(r.chemistCallAvg),
    r.coverage.doctors,
    r.coverage.met,
    num(r.coverage.coveragePct),
    r.coverage.metFully,
    r.coverage.withFrequency,
    num(r.coverage.frequencyPct),
    r.coverage.required,
    r.coverage.made,
    num(r.coverage.compliancePct),
    r.coverage.missed,
  ];
  return [
    ...report.rows.map((r) => row(r.employee.name, r.employee.employeeCode, r.employee.designation ?? '', r.scope === 'TEAM' ? 'Team' : 'Own', r)),
    row('Total (MRs)', '', '', '', report.totals),
  ];
}

export const callPerformanceFilename = (fromMonth: string, toMonth: string, ext: 'xlsx' | 'csv') =>
  `GREYNOTE CALL AVERAGE & COVERAGE ${fromMonth === toMonth ? fromMonth : `${fromMonth} to ${toMonth}`}.${ext}`;

export const MISSED_HEADER = ['Doctor', 'Speciality', 'Place', 'Area', 'Visits a month', 'Held by'] as const;
export const missedRows = (list: readonly MissedDoctorDto[]): Array<Array<string | number>> =>
  list.map((d) => [d.name, d.specialty, d.placeName ?? '', d.address, d.visitFrequency ?? '', d.heldBy?.name ?? '']);
