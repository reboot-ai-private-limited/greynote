/**
 * One employee's month of daily work (the Daily Work report): what the Tour Plan said, what the Daily Plan was, which doctors were planned, called,
 * missed and carried, the report, calls and orders, day by day, and the month in totals. Pure: the report class reads the data and this works it out,
 * so the app and the Excel agree. Only calls on a **submitted or approved** report count (as in the visit report and the carry-over); only an
 * **approved** Daily Plan makes a doctor planned. A doctor planned and not called is owed from the next day, until a call (the month's carry-over).
 */
const SUBMITTED = ['SUBMITTED', 'MANAGER_APPROVED', 'APPROVED'];
const APPROVED = ['APPROVED', 'MANAGER_APPROVED'];

export interface DayInput {
  date: string;
  /** The attendance read of the day (PRESENT, ABSENT, LEAVE, HOLIDAY, WEEKLY_OFF, STRIKE…), `null` when it has none. */
  attendance: string | null;
  /** What the Tour Plan says for the day, in words (route names or the work type); `null` = nothing. */
  tourWords: string | null;
  plan: { status: string; workingType: string; routeNames: string[]; workWith: string[]; doctorIds: string[]; changedFromMonthly: boolean; remarks: string | null } | null;
  report: { status: string } | null;
  calls: { doctorIds: string[]; chemistCalls: number; followups: number; geofence: { pass: number; fail: number; other: number } };
  orders: { count: number; paise: number };
}

export interface DoctorTarget {
  doctorId: string;
  name: string;
  frequency: number;
}

export interface DayRow {
  date: string;
  weekday: string;
  /** Worked, Leave, Weekly off, Holiday, Absent, Strike… */
  kind: string;
  tourWords: string | null;
  dailyWords: string | null;
  planStatus: string | null;
  /** The Daily Plan differs from what the Tour Plan said; `null` = no Daily Plan. */
  changed: boolean | null;
  workWith: string[];
  /** `null` on a day not counted yet (today and later in the running month). */
  planned: number | null;
  visited: number | null;
  missed: number | null;
  carriedIn: number | null;
  alsoVisited: number | null;
  visitedNames: string[];
  missedNames: string[];
  doctorCalls: number;
  chemistCalls: number;
  followups: number;
  orders: number;
  ordersPaise: number;
  /** "Sent", "Approved", "Not sent" or "No report". */
  report: string;
  remarks: string | null;
}

export interface DoctorRow {
  doctorId: string;
  name: string;
  frequency: number;
  /** Calls on submitted or approved reports this month. */
  visits: number;
  missed: number;
  plannedDays: number;
  carriedSince: string | null;
  lastVisit: string | null;
}

export interface DailyWorkOverview {
  days: { total: number; worked: number; leave: number; weeklyOff: number; holiday: number; absent: number; other: number };
  reports: { sent: number; notSent: number };
  calls: { doctor: number; chemist: number; followups: number };
  doctors: { plannedDays: number; visited: number; missed: number; carriedAtEnd: number; alsoVisited: number };
  targets: { withTarget: number; quota: number; made: number; missed: number; notCalled: number };
  orders: { count: number; paise: number };
  location: { pass: number; fail: number; other: number };
  routes: Array<{ name: string; days: number; doctorCalls: number }>;
}

export interface DailyWork {
  month: string;
  /** The last day counted (yesterday in the running month, the month's end otherwise). */
  countedThrough: string;
  rows: DayRow[];
  doctors: DoctorRow[];
  overview: DailyWorkOverview;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const weekdayOf = (iso: string) => WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()]!;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const KIND: Record<string, string> = { PRESENT: 'Worked', ABSENT: 'Absent', LEAVE: 'Leave', HOLIDAY: 'Holiday', WEEKLY_OFF: 'Weekly off', STRIKE: 'Strike', NOT_YET: '', BEFORE_JOINING: 'Not joined', NOT_EMPLOYED: 'Not employed' };

const reportWords = (r: { status: string } | null) => (!r ? 'No report' : r.status === 'APPROVED' || r.status === 'MANAGER_APPROVED' ? 'Approved' : r.status === 'SUBMITTED' ? 'Sent' : 'Not sent');

export function buildDailyWork(input: {
  month: string;
  /** Every date of the month, in order. */
  dates: string[];
  days: DayInput[];
  /** Today (business day). */
  today: string;
  names: ReadonlyMap<string, string>;
  targets: DoctorTarget[];
  /** Planning's month summary for the person: days planned and the day first planned if still owed. */
  planned: Array<{ doctorId: string; plannedDays: number; missedSince: string | null }>;
}): DailyWork {
  const byDate = new Map(input.days.map((d) => [d.date, d]));
  const through = addDays(input.today, -1) < input.dates[input.dates.length - 1]! ? addDays(input.today, -1) : input.dates[input.dates.length - 1]!;
  const nameOf = (id: string) => input.names.get(id) ?? '(doctor)';

  const owed = new Set<string>();
  const visitsBy = new Map<string, { n: number; last: string | null }>();
  const routeAgg = new Map<string, { days: number; doctorCalls: number }>();
  const rows: DayRow[] = [];
  const ov: DailyWorkOverview = {
    days: { total: input.dates.length, worked: 0, leave: 0, weeklyOff: 0, holiday: 0, absent: 0, other: 0 },
    reports: { sent: 0, notSent: 0 },
    calls: { doctor: 0, chemist: 0, followups: 0 },
    doctors: { plannedDays: 0, visited: 0, missed: 0, carriedAtEnd: 0, alsoVisited: 0 },
    targets: { withTarget: 0, quota: 0, made: 0, missed: 0, notCalled: 0 },
    orders: { count: 0, paise: 0 },
    location: { pass: 0, fail: 0, other: 0 },
    routes: [],
  };

  for (const date of input.dates) {
    const d = byDate.get(date);
    const counted = date <= through;
    const submitted = !!d?.report && SUBMITTED.includes(d.report.status);
    const plan = d?.plan ?? null;
    const approved = !!plan && APPROVED.includes(plan.status);
    const calledIds = submitted ? [...new Set(d!.calls.doctorIds)] : [];
    const plannedIds = counted && approved ? [...new Set(plan!.doctorIds)] : [];

    let carriedIn: number | null = null;
    let visitedIds: string[] = [];
    let missedIds: string[] = [];
    let also = 0;
    if (counted) {
      carriedIn = owed.size;
      visitedIds = plannedIds.filter((x) => calledIds.includes(x));
      missedIds = plannedIds.filter((x) => !calledIds.includes(x));
      also = calledIds.filter((x) => !plannedIds.includes(x)).length;
      // A doctor planned and not called is owed from the next day; any call clears one.
      for (const m of missedIds) owed.add(m);
      for (const c of calledIds) owed.delete(c);
      for (const c of submitted ? d!.calls.doctorIds : []) {
        const v = visitsBy.get(c) ?? { n: 0, last: null };
        v.n += 1;
        if (!v.last || date > v.last) v.last = date;
        visitsBy.set(c, v);
      }
    }

    const att = d?.attendance ?? null;
    // A report that was sent is the evidence of work, whatever the attendance read says.
    const kind = submitted ? 'Worked' : att ? (KIND[att] ?? att) : '';
    const lower = kind.toLowerCase();
    if (counted || att) {
      if (kind === 'Worked') ov.days.worked += 1;
      else if (kind === 'Leave') ov.days.leave += 1;
      else if (kind === 'Weekly off') ov.days.weeklyOff += 1;
      else if (kind === 'Holiday') ov.days.holiday += 1;
      else if (kind === 'Absent') ov.days.absent += 1;
      else if (lower !== '') ov.days.other += 1;
    }
    if (counted && kind === 'Worked') {
      if (submitted) ov.reports.sent += 1;
      else ov.reports.notSent += 1;
    }
    if (d) {
      ov.calls.doctor += submitted ? d.calls.doctorIds.length : 0;
      ov.calls.chemist += submitted ? d.calls.chemistCalls : 0;
      ov.calls.followups += submitted ? d.calls.followups : 0;
      ov.orders.count += d.orders.count;
      ov.orders.paise += d.orders.paise;
      if (submitted) {
        ov.location.pass += d.calls.geofence.pass;
        ov.location.fail += d.calls.geofence.fail;
        ov.location.other += d.calls.geofence.other;
      }
    }
    ov.doctors.plannedDays += plannedIds.length;
    ov.doctors.visited += visitedIds.length;
    ov.doctors.missed += missedIds.length;
    ov.doctors.alsoVisited += also;
    if (plan && plan.routeNames.length > 0 && submitted) {
      for (const name of plan.routeNames) {
        const r = routeAgg.get(name) ?? { days: 0, doctorCalls: 0 };
        r.days += 1;
        r.doctorCalls += d!.calls.doctorIds.length;
        routeAgg.set(name, r);
      }
    }

    const dailyWords = plan ? (plan.status === 'DRAFT' ? null : plan.routeNames.length > 0 ? plan.routeNames.join(', ') : plan.workingType.replace(/_/g, ' ').toLowerCase()) : null;
    rows.push({
      date,
      weekday: weekdayOf(date),
      kind,
      tourWords: d?.tourWords ?? null,
      dailyWords,
      planStatus: plan?.status ?? null,
      changed: plan ? plan.changedFromMonthly : null,
      workWith: plan?.workWith ?? [],
      planned: counted ? plannedIds.length : null,
      visited: counted ? visitedIds.length : null,
      missed: counted ? missedIds.length : null,
      carriedIn,
      alsoVisited: counted ? also : null,
      visitedNames: visitedIds.map(nameOf),
      missedNames: missedIds.map(nameOf),
      doctorCalls: submitted ? d!.calls.doctorIds.length : 0,
      chemistCalls: submitted ? d!.calls.chemistCalls : 0,
      followups: submitted ? d!.calls.followups : 0,
      orders: d?.orders.count ?? 0,
      ordersPaise: d?.orders.paise ?? 0,
      report: reportWords(d?.report ?? null),
      remarks: plan?.remarks ?? null,
    });
  }

  const plannedOf = new Map(input.planned.map((p) => [p.doctorId, p]));
  const doctors: DoctorRow[] = input.targets
    .map((t): DoctorRow => {
      const v = visitsBy.get(t.doctorId);
      const made = Math.min(v?.n ?? 0, t.frequency);
      return { doctorId: t.doctorId, name: t.name, frequency: t.frequency, visits: v?.n ?? 0, missed: t.frequency - made, plannedDays: plannedOf.get(t.doctorId)?.plannedDays ?? 0, carriedSince: plannedOf.get(t.doctorId)?.missedSince ?? null, lastVisit: v?.last ?? null };
    })
    .sort((a, b) => b.missed - a.missed || a.name.localeCompare(b.name));
  ov.targets = {
    withTarget: doctors.length,
    quota: doctors.reduce((n, r) => n + r.frequency, 0),
    made: doctors.reduce((n, r) => n + (r.frequency - r.missed), 0),
    missed: doctors.reduce((n, r) => n + r.missed, 0),
    notCalled: doctors.filter((r) => r.visits === 0).length,
  };
  ov.doctors.carriedAtEnd = input.planned.filter((p) => p.missedSince !== null).length;
  ov.routes = [...routeAgg].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.days - a.days || a.name.localeCompare(b.name));
  return { month: input.month, countedThrough: through, rows, doctors, overview: ov };
}
