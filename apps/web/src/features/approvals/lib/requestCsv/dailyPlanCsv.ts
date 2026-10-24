import type { DailyPlanDto } from '@greynote/contracts';
import { toCsv } from '@/lib/csv';
import { DAY_KIND_LABEL, WORKING_TYPE_LABEL } from '../review';

export const DAILY_PLAN_CSV_HEADER = ['Date', 'Working type', 'Day kind', 'Routes', 'Doctor', 'Carried from', 'Work with', 'Remarks', 'Plan status'] as const;

/**
 * One employee's day: a row for each doctor to call (the day's columns repeat on each), or a single row when no doctors are planned.
 * `routeLabel`, `personName` and `doctorName` name ids; they are looked up before this runs.
 */
export function dailyPlanCsv(
  plan: Pick<DailyPlanDto, 'planDate' | 'workingType' | 'dayKind' | 'routeIds' | 'workWith' | 'remarks' | 'doctors' | 'status'>,
  names: { routeLabel: (id: string) => string; personName: (id: string) => string; doctorName: (id: string) => string },
): string {
  const day = [
    plan.planDate,
    WORKING_TYPE_LABEL[plan.workingType],
    plan.dayKind === 'NORMAL' ? 'Normal' : DAY_KIND_LABEL[plan.dayKind],
    plan.routeIds.map(names.routeLabel).join('; ') || null,
  ];
  const rest = [plan.workWith.map(names.personName).join('; ') || null, plan.remarks, plan.status];
  const rows = plan.doctors.length > 0 ? plan.doctors.map((d) => [...day, names.doctorName(d.doctorId), d.carriedFrom, ...rest]) : [[...day, null, null, ...rest]];
  return toCsv(DAILY_PLAN_CSV_HEADER, rows);
}
