import { AppError } from '@/shared/errors/AppError.js';
import { monthRange } from '@/shared/time/businessTime.js';
import type { FieldRosterPort, IdentityPort, ManagerNamePort, TerritoryPort, TourPlanExportPort } from '../domain/ports.js';

export interface TourPlanInput {
  actor: { id: string; role: string };
  userId: string;
  /** `YYYY-MM`. */
  month: string;
}

export interface TourPlanRow {
  /** `YYYY-MM-DD`. */
  date: string;
  weekday: string;
  /** The working type's name, or "Weekly off" / "Holiday · Diwali" / "Not planned" for a day with no entry. */
  workType: string;
  trip: string;
  routes: string;
  from: string;
  to: string;
  /** One line per route, in plan order, like `from` and `to`. */
  routeType: string;
  workWith: string;
  remarks: string;
}

export interface TourPlanModel {
  employee: { name: string; employeeCode: string; designation: string | null; /** Their direct manager, or empty. */ managerName: string };
  month: string;
  rows: TourPlanRow[];
}

const WORKING_TYPE: Record<string, string> = { FIELD_WORK: 'Field Work', DOCTOR_CAMPAIGN: 'Doctor Campaign', MEETING: 'Meeting', CONFERENCE: 'Conference', STRIKE: 'Strike' };
const ROUTE_TYPE: Record<string, string> = { HQ: 'HQ', EX_STATION: 'Ex-station', OUT_STATION: 'Out-station' };
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** A route is named "From to To": the two ends, or the whole name as the To when it has no " to ". */
export function routeFromTo(name: string): { from: string; to: string } {
  const m = /^(.+?)\s+to\s+(.+)$/i.exec(name.trim());
  return m ? { from: m[1]!.trim(), to: m[2]!.trim() } : { from: '', to: name.trim() };
}

/**
 * One employee's approved Tour Plan for a month, a row for every calendar day (decision-log 2026-11-19), built once on the server so the phone and the web download
 * the same Excel. Only an approved plan is handed out. The office reads anyone's, an employee their own, a manager their downline's.
 */
export class TourPlanReport {
  constructor(
    private readonly planning: TourPlanExportPort,
    private readonly territory: TerritoryPort,
    private readonly identity: IdentityPort & FieldRosterPort & ManagerNamePort,
  ) {}

  async read(input: TourPlanInput): Promise<TourPlanModel> {
    await this.assertMayRead(input.actor, input.userId);
    const [who] = await this.identity.listFieldEmployees([input.userId]);
    const [summary] = who ? [] : await this.identity.getUserSummaries([input.userId]);
    const person = who ?? summary;
    if (!person) throw AppError.notFound('No such employee.');

    const plan = await this.planning.readTourPlanForExport(input.userId, input.month);
    if (!plan || (plan.status !== 'APPROVED' && plan.status !== 'MANAGER_APPROVED')) {
      throw AppError.conflict(`No approved Tour Plan for ${input.month}.`, { reason: 'TOUR_PLAN_NOT_APPROVED' });
    }

    const routeIds = [...new Set(plan.entries.flatMap((e) => e.routeIds))];
    const routes = new Map(await Promise.all(routeIds.map(async (id) => [id, await this.territory.getRoute(id)] as const)));
    const peopleIds = [...new Set(plan.entries.flatMap((e) => e.workWith))];
    const people = new Map((peopleIds.length ? await this.identity.getUserSummaries(peopleIds) : []).map((u) => [u.id, u.name]));
    const entryOf = new Map(plan.entries.map((e) => [e.date, e]));
    const offOf = new Map(plan.offDays.map((d) => [d.date, d]));

    const range = monthRange(input.month);
    const rows: TourPlanRow[] = [];
    for (let t = Date.parse(`${range.from}T00:00:00Z`); t <= Date.parse(`${range.to}T00:00:00Z`); t += 86_400_000) {
      const d = new Date(t);
      const date = d.toISOString().slice(0, 10);
      const weekday = WEEKDAY[d.getUTCDay()]!;
      const e = entryOf.get(date);
      if (!e) {
        const off = offOf.get(date);
        const label = off ? (off.reason === 'HOLIDAY' ? `Holiday · ${off.name ?? 'Holiday'}` : 'Weekly off') : 'Not planned';
        rows.push({ date, weekday, workType: label, trip: '', routes: '', from: '', to: '', routeType: '', workWith: '', remarks: '' });
        continue;
      }
      const known = e.routeIds.map((id) => routes.get(id)).filter((r): r is NonNullable<typeof r> => r != null);
      const ends = known.map((r) => routeFromTo(r.name));
      const anyFrom = ends.some((x) => x.from !== '');
      rows.push({
        date,
        weekday,
        workType: WORKING_TYPE[e.workingType] ?? e.workingType,
        trip: e.dayKind === 'STAY' ? 'Stay day' : e.dayKind === 'TRANSIT' ? 'Return day' : '',
        routes: e.routeIds.length === 0 ? '' : e.routeIds.map((id) => { const r = routes.get(id); return r ? `${r.name}${r.routeType ? ` (${ROUTE_TYPE[r.routeType] ?? r.routeType})` : ''}` : 'Route no longer exists'; }).join(', '),
        // Several routes: one line each, in plan order, so line 1 of From goes with line 1 of To and of Route type.
        from: anyFrom ? ends.map((x) => x.from || '-').join('\n') : '',
        to: ends.map((x) => x.to).join('\n'),
        routeType: known.map((r) => (r.routeType ? ROUTE_TYPE[r.routeType] ?? r.routeType : '-')).join('\n'),
        workWith: e.workWith.map((id) => people.get(id) ?? 'Colleague').join('; '),
        remarks: e.remarks ?? '',
      });
    }
    const managerName = (await this.identity.getManagerChain(input.userId).catch(() => []))[0]?.name ?? '';
    return { employee: { name: person.name, employeeCode: person.employeeCode, designation: who?.designation ?? null, managerName }, month: input.month, rows };
  }

  private async assertMayRead(actor: { id: string; role: string }, userId: string): Promise<void> {
    if (actor.role === 'ADMIN' || actor.role === 'ACCOUNTANT' || actor.role === 'HR' || actor.id === userId) return;
    if (actor.role === 'FIELD' && (await this.identity.getDownline(actor.id)).some((u) => u.id === userId)) return;
    throw AppError.forbidden('You can only download your own Tour Plan and your team\'s.');
  }
}
