import { logger } from '@/shared/logging/logger.js';
import { ApprovalRequestModel } from '@/modules/approval/infrastructure/approvalRequest.schema.js';
import type { MonthlyPlanEntry } from '@/modules/planning/domain/monthlyPlan.entity.js';
import { expandTrips } from '@/modules/planning/domain/tripExpansion.js';
import { DailyPlanModel } from '@/modules/planning/infrastructure/dailyPlan.schema.js';
import { MongoMonthlyPlanAdapter } from '@/modules/planning/infrastructure/mongoMonthlyPlan.adapter.js';
import { MonthlyPlanModel } from '@/modules/planning/infrastructure/monthlyPlan.schema.js';
import { UserModel } from '@/modules/identity/infrastructure/user.schema.js';
import { RouteModel } from '@/modules/territory/infrastructure/route.schema.js';

/**
 * Demo Tour Plans for December 2026, to try the whole plan flow by hand (submit, approve, edit an approved month, trips, delete),
 * for the demo team of `demoHierarchy.ts`. Only users with `isDemo` are touched; other months and users never are.
 *
 * - DEMOMRA1 (under DEMOASM): a month that is SUBMITTED, waiting for the ASM (or Admin/HR) to approve. It has a 3-night out-station
 *   trip (Mon 7 → Thu 10 Dec), a 1-night trip (Mon 21 → Tue 22 Dec) and two days that work with DEMOMRA2.
 * - DEMOMRA2 (under DEMOASM): a DRAFT month, not yet sent, with one trip.
 * - DEMOMRR1 (direct to DEMORSM): a SUBMITTED month with one trip, for the RSM to approve.
 * Trips use the out-station route "DEMO Test HQ A to Kolkata" every demo MR already has. Running it again changes nothing;
 * `--remove` takes the December plans (and any daily plans written from them) away again.
 */
const MONTH = '2026-12';
const OUT_ROUTE = 'DEMO Test HQ A to Kolkata';
const HOME_ROUTE = (key: string, destination: string) => `DEMO Test HQ ${key} to ${destination}`;
const keyOf = (s: string) => s.trim().toLowerCase();
const date = (day: number) => `${MONTH}-${String(day).padStart(2, '0')}`;
/** Sundays are the weekly off; 25 Dec is a holiday. */
const isOff = (day: number) => new Date(Date.UTC(2026, 11, day)).getUTCDay() === 0 || day === 25;

function entry(day: number, over: Partial<MonthlyPlanEntry> & { routeIds: string[] }): MonthlyPlanEntry {
  return { planDate: date(day), returnDate: null, workingType: 'FIELD_WORK', dayKind: 'NORMAL', workWith: [], remarks: null, ...over };
}

/** Every working day on `route`, except the days the trips cover, with the given days replaced. */
function month(route: string, replace: Record<number, MonthlyPlanEntry>, skip: number[]): MonthlyPlanEntry[] {
  const typed: MonthlyPlanEntry[] = [];
  for (let day = 1; day <= 31; day++) {
    if (isOff(day) || skip.includes(day)) continue;
    typed.push(replace[day] ?? entry(day, { routeIds: [route] }));
  }
  for (const [day, e] of Object.entries(replace)) if (skip.includes(Number(day))) typed.push(e);
  return typed.sort((a, b) => a.planDate.localeCompare(b.planDate));
}

async function route(name: string) {
  const found = await RouteModel.findOne({ nameKey: keyOf(name) }).lean();
  if (!found) throw new Error(`Route "${name}" is missing: run seed:demo-hierarchy first.`);
  return found;
}

export async function seedDemoPlans(): Promise<void> {
  const users = await UserModel.find({ employeeCode: { $in: ['DEMOMRA1', 'DEMOMRA2', 'DEMOMRR1'] }, isDemo: true }).lean();
  const byCode = new Map(users.map((u) => [u.employeeCode, u]));
  const [a1, a2, r1] = [byCode.get('DEMOMRA1'), byCode.get('DEMOMRA2'), byCode.get('DEMOMRR1')];
  if (!a1 || !a2 || !r1) throw new Error('The demo team is missing: run seed:demo-hierarchy first.');
  const [matigara, bagdogra, naxalbari, kolkata] = await Promise.all([
    route(HOME_ROUTE('A', 'Matigara')),
    route(HOME_ROUTE('A', 'Bagdogra')),
    route(HOME_ROUTE('B', 'Naxalbari')),
    route(OUT_ROUTE),
  ]);
  const now = new Date();
  const away = String(kolkata._id);
  const plans = new MongoMonthlyPlanAdapter();
  const trip = (day: number, back: number): MonthlyPlanEntry => entry(day, { routeIds: [away], returnDate: date(back), remarks: 'Demo trip' });
  const withA2 = (day: number): MonthlyPlanEntry => entry(day, { routeIds: [String(matigara._id)], workWith: [String(a2._id)], remarks: 'Joint day with Demo MR A2' });

  const jobs = [
    { user: a1, send: true, days: month(String(matigara._id), { 7: trip(7, 10), 14: withA2(14), 15: withA2(15), 21: trip(21, 22) }, [8, 9, 10, 22]) },
    { user: a2, send: false, days: month(String(bagdogra._id), { 14: trip(14, 16) }, [15, 16]) },
    { user: r1, send: true, days: month(String(naxalbari._id), { 9: trip(9, 11) }, [10, 11]) },
  ];
  const created: string[] = [];
  for (const { user, send, days } of jobs) {
    if (await plans.findByUserAndMonth(String(user._id), MONTH)) continue;
    const { entries } = expandTrips(MONTH, days);
    const plan = await plans.save(String(user._id), MONTH, entries, null);
    if (!plan) continue;
    if (send) {
      await ApprovalRequestModel.create({
        kind: 'MONTHLY_PLAN',
        recordId: plan.id,
        submitterId: user._id,
        status: 'SUBMITTED',
        workflow: 'MANAGER_ONLY',
        cycle: 1,
        submittedAt: now,
        decidedAt: null,
        history: [{ action: 'SUBMIT', authority: 'SUBMITTER', actorId: user._id, actorRole: 'FIELD', comment: null, at: now, resultingStatus: 'SUBMITTED', cycle: 1 }],
      });
    }
    created.push(`${user.employeeCode} ${send ? 'submitted' : 'draft'}`);
  }
  logger.info({ month: MONTH, created }, created.length ? 'demo plans created' : 'demo plans are already there — use --remove to start again');
}

export async function removeDemoPlans(): Promise<void> {
  const users = await UserModel.find({ employeeCode: { $in: ['DEMOMRA1', 'DEMOMRA2', 'DEMOMRR1'] }, isDemo: true }, { _id: 1 }).lean();
  const ids = users.map((u) => u._id);
  const plans = await MonthlyPlanModel.find({ userId: { $in: ids }, planMonth: MONTH }, { _id: 1 }).lean();
  const days = await DailyPlanModel.find({ userId: { $in: ids }, planDate: { $gte: date(1), $lte: date(31) } }, { _id: 1 }).lean();
  const out = {
    approvals: (await ApprovalRequestModel.deleteMany({ kind: 'MONTHLY_PLAN', recordId: { $in: plans.map((p) => String(p._id)) } })).deletedCount
      + (await ApprovalRequestModel.deleteMany({ kind: 'DAILY_PLAN', recordId: { $in: days.map((d) => String(d._id)) } })).deletedCount,
    dailyPlans: (await DailyPlanModel.deleteMany({ _id: { $in: days.map((d) => d._id) } })).deletedCount,
    monthlyPlans: (await MonthlyPlanModel.deleteMany({ _id: { $in: plans.map((p) => p._id) } })).deletedCount,
  };
  logger.info(out, 'demo plans removed');
}
