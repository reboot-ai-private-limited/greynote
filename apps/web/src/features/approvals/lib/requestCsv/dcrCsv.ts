import type { DcrDetailDto } from '@greynote/contracts';
import { toCsv } from '@/lib/csv';
import { GEOFENCE_LABEL, ROUTE_TYPE_LABEL, WORKING_TYPE_LABEL } from '../review';

export const DCR_CSV_HEADER = [
  'Date',
  'Type',
  'Name',
  'Route',
  'Route type',
  'Working type',
  'Recorded at',
  'Geofence',
  'Distance (m)',
  'Not in plan',
  'Samples',
  'Work with',
  'Remarks',
] as const;

const yes = (flag: boolean) => (flag ? 'Yes' : null);

/**
 * One daily report: a row per doctor call, chemist call and follow-up, in the order they were recorded. The day's expenses are a
 * different shape and are not in this file.
 */
export function dcrCsv(
  dcr: Pick<DcrDetailDto, 'reportDate' | 'doctorCalls' | 'chemistCalls' | 'followups'>,
  names: { routeLabel: (id: string) => string; personName: (id: string) => string },
): string {
  const place = (routeId: string | null) => (routeId ? names.routeLabel(routeId) : null);
  const rows = [
    ...dcr.doctorCalls.map((c) => ({
      at: c.recordedAt,
      row: [
        'Doctor call', c.doctorName, place(c.routeId), c.routeType && ROUTE_TYPE_LABEL[c.routeType], WORKING_TYPE_LABEL[c.workingType], c.recordedAt,
        GEOFENCE_LABEL[c.geofence.status], c.geofence.distanceMeters, yes(c.notInPlan || c.routeNotInPlan),
        c.samples.map((s) => `${s.productName} x ${s.quantity}`).join('; ') || null, c.workWith.map(names.personName).join('; ') || null, c.remarks,
      ],
    })),
    ...dcr.chemistCalls.map((c) => ({
      at: c.recordedAt,
      row: [
        'Chemist call', c.chemistName, place(c.routeId), c.routeType && ROUTE_TYPE_LABEL[c.routeType], WORKING_TYPE_LABEL[c.workingType], c.recordedAt,
        GEOFENCE_LABEL[c.geofence.status], c.geofence.distanceMeters, yes(c.routeNotInPlan), null, c.workWith.map(names.personName).join('; ') || null, c.remarks,
      ],
    })),
    ...dcr.followups.map((f) => ({
      at: f.recordedAt,
      row: [
        'Follow-up', f.subjectName, place(f.routeId), f.routeType && ROUTE_TYPE_LABEL[f.routeType], f.workingType && WORKING_TYPE_LABEL[f.workingType], f.recordedAt,
        f.geofence && GEOFENCE_LABEL[f.geofence.status], f.geofence?.distanceMeters, yes(f.notInPlan), null, null, f.remarks,
      ],
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  return toCsv(DCR_CSV_HEADER, rows.map(({ row }) => [dcr.reportDate, ...row]));
}
