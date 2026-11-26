import mongoose, { Types } from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';
import { ApprovalRequestModel } from '@/modules/approval/infrastructure/approvalRequest.schema.js';
import { ChemistAssignmentModel } from '@/modules/field-master-data/infrastructure/chemistAssignment.schema.js';
import { DoctorAssignmentModel } from '@/modules/field-master-data/infrastructure/doctorAssignment.schema.js';
import { DoctorModel } from '@/modules/field-master-data/infrastructure/doctor.schema.js';
import { ChemistModel } from '@/modules/field-master-data/infrastructure/chemist.schema.js';
import { DcrModel } from '@/modules/field-activity/infrastructure/dcr.schema.js';
import { ChemistCallModel, DoctorCallModel, ExpenseModel, FollowupModel } from '@/modules/field-activity/infrastructure/records.schema.js';
import { LeaveModel } from '@/modules/hr/infrastructure/leave.schema.js';
import { LeaveTypeModel } from '@/modules/hr/infrastructure/leaveType.schema.js';
import { UserModel } from '@/modules/identity/infrastructure/user.schema.js';
import { DailyPlanModel } from '@/modules/planning/infrastructure/dailyPlan.schema.js';
import { toDayDoc } from '@/modules/planning/infrastructure/planDoc.js';
import { assertLocalDatabase } from './localTestData.js';

/**
 * A month of daily work for three demo MRs, so the Daily Work report, the Expense report and the "doctors this month" numbers have something to show.
 * LOCAL DATABASE ONLY (it refuses any other `MONGO_URI`). Needs `seed:local-test` applied.
 *
 *   DOTENV_CONFIG_PATH=.env.local pnpm --filter @greynote/api seed:work-demo            dry run
 *   DOTENV_CONFIG_PATH=.env.local pnpm --filter @greynote/api seed:work-demo -- --apply  write
 *
 * For DEMOMRA1, DEMOMRA2 and DEMOMRB1, every working day (Monday to Saturday) of this month up to yesterday gets an approved Daily Plan of three
 * doctors on the MR's route. Most days have an approved report with calls on two of the three planned doctors (the others are missed; the last doctor is never called, so he is carried to the month's end),
 * a chemist call, sometimes a follow-up, sometimes an unplanned doctor; one day in seven has no report at all (all three missed). Each reported day
 * has TA and DA expenses (AUTO, accepted); one day has an own claim. One day is a paid leave and one an unpaid leave (approved, no plan or report). Every doctor of these MRs gets a visit target of 2 a month.
 * Written straight into the local database (the approvals as already approved): it skips the phone's sync, geofence and approval flows.
 * Safe to run again: it first removes the daily plans, reports, calls and expenses of these MRs for the month.
 */
const MRS = ['DEMOMRA3', 'DEMOMRB1', 'DEMOMRB2'];
const pad = (n: number) => String(n).padStart(2, '0');
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

async function main(): Promise<void> {
  assertLocalDatabase(env.MONGO_URI);
  const apply = process.argv.includes('--apply');
  await mongoose.connect(env.MONGO_URI);
  try {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    const yesterday = addDays(today, -1);
    const days: string[] = [];
    for (let d = `${month}-01`; d <= yesterday; d = addDays(d, 1)) if (new Date(`${d}T00:00:00Z`).getUTCDay() !== 0) days.push(d);

    const users = await UserModel.find({ employeeCode: { $in: MRS } }, { _id: 1, employeeCode: 1, name: 1 }).lean();
    if (users.length !== MRS.length) throw new Error('the demo MRs are not there; run seed:local-test -- --apply first');
    const paidType = await LeaveTypeModel.findOne({ isPaid: true }, { _id: 1 }).lean();
    const unpaidType = await LeaveTypeModel.findOne({ isPaid: false }, { _id: 1 }).lean();
    const summary: Record<string, unknown>[] = [];
    const writes: Array<() => Promise<unknown>> = [];

    for (const u of users) {
      const userId = u._id as Types.ObjectId;
      const held = await DoctorAssignmentModel.find({ userId, status: 'active' }, { doctorId: 1 }).lean();
      const doctors = await DoctorModel.find({ _id: { $in: held.map((h) => h.doctorId) }, status: 'active' }, { _id: 1, name: 1, routeId: 1 }).sort({ name: 1 }).lean();
      const chemistIds = (await ChemistAssignmentModel.find({ userId, status: 'active' }, { chemistId: 1 }).lean()).map((c) => c.chemistId);
      const chemists = await ChemistModel.find({ _id: { $in: chemistIds } }, { _id: 1, routeId: 1 }).lean();
      if (doctors.length < 4) throw new Error(`${u.employeeCode} holds ${doctors.length} doctors; need at least 4`);
      let reported = 0;
      let missedDays = 0;
      let calls = 0;

      days.forEach((date, k) => {
        // One paid-leave day and one unpaid-leave day (no plan, no report), written as approved leaves.
        if ((k === 5 || k === 9) && paidType && unpaidType) {
          const paid = k === 5;
          const leaveId = new Types.ObjectId();
          writes.push(async () => {
            await LeaveModel.create({ _id: leaveId, userId, leaveTypeId: paid ? paidType._id : unpaidType._id, isPaid: paid, year: Number(date.slice(0, 4)), startDate: date, endDate: date, half: null, reason: 'work-demo', days: [{ date, portion: 1 }], daysCount: 1, ledgerDays: paid ? 1 : 0, attachments: [], revision: 1, createdAt: now, updatedAt: now });
            await ApprovalRequestModel.create({ kind: 'LEAVE', recordId: String(leaveId), submitterId: userId, status: 'APPROVED', workflow: 'MANAGER_ONLY', cycle: 1, submittedAt: now, decidedAt: now, history: [{ action: 'APPROVE', authority: 'MANAGER', actorId: userId, actorRole: 'FIELD', comment: null, at: now, resultingStatus: 'APPROVED', cycle: 1 }] });
          });
          return;
        }
        const planned = [0, 1, 2].map((i) => doctors[(k * 3 + i) % doctors.length]!);
        const routeId = planned[0]!.routeId as Types.ObjectId;
        const reportedDay = k % 7 !== 3;
        const planId = new Types.ObjectId();
        writes.push(async () => {
          await DailyPlanModel.create({ _id: planId, userId, planDate: date, ...toDayDoc({ workingType: 'FIELD_WORK', dayKind: 'NORMAL', workWith: [], routeIds: [String(routeId)], fromPlaceId: null, toPlaceId: null, remarks: null }), source: 'MANUAL', doctors: planned.map((d) => ({ doctorId: d._id, carriedFrom: null })), amendments: [], revision: 1, lateResubmits: 0, updatedAt: now });
          await ApprovalRequestModel.create({ kind: 'DAILY_PLAN', recordId: String(planId), submitterId: userId, status: 'APPROVED', workflow: 'MANAGER_ONLY', cycle: 1, submittedAt: now, decidedAt: now, history: [{ action: 'APPROVE', authority: 'MANAGER', actorId: userId, actorRole: 'FIELD', comment: null, at: now, resultingStatus: 'APPROVED', cycle: 1 }] });
        });
        if (!reportedDay) {
          missedDays += 1;
          return;
        }
        reported += 1;
        const dcrId = new Types.ObjectId();
        // The last doctor is never called, so he is planned again and again and carried to the month's end.
        const never = doctors[doctors.length - 1]!;
        const called = planned.filter((d) => d !== never).slice(0, 2);
        const extra = doctors[(k + 5) % doctors.length]!;
        if (k % 5 === 1 && extra !== never && !called.includes(extra)) called.push(extra); // an unplanned doctor
        calls += called.length;
        const base = { dcrId, userId, reportDate: date, workingType: 'FIELD_WORK' as const, routeId, routeType: 'HQ' as const, remarks: null, capturedLatitude: null, capturedLongitude: null, accuracyMeters: null, geofenceStatus: 'PASS' as const, geofenceDistanceMeters: null, geofenceReason: null, geofenceOverriddenBy: null, geofenceOverriddenAt: null, geofenceOverrideComment: null, recordedAt: new Date(`${date}T08:30:00Z`) };
        writes.push(async () => {
          await DcrModel.create({ _id: dcrId, userId, reportDate: date, remarks: 'work-demo', createdAt: now });
          await ApprovalRequestModel.create({ kind: 'DCR', recordId: String(dcrId), submitterId: userId, status: 'APPROVED', workflow: 'MANAGER_ONLY', cycle: 1, submittedAt: now, decidedAt: now, history: [{ action: 'APPROVE', authority: 'AUTO', actorId: userId, actorRole: 'FIELD', comment: null, at: now, resultingStatus: 'APPROVED', cycle: 1 }] });
          await DoctorCallModel.insertMany(called.map((d, i) => ({ ...base, doctorId: d._id, workWith: [], samples: [], notInPlan: !planned.some((p) => String(p._id) === String(d._id)), clientId: `work-demo:${u.employeeCode}:${date}:d${i}` })));
          const cs = chemists.slice(0, 2);
          if (cs.length) await ChemistCallModel.insertMany(cs.map((c, i) => ({ ...base, chemistId: c._id, clientId: `work-demo:${u.employeeCode}:${date}:c${i}` })));
          if (k % 3 === 0) await FollowupModel.create({ dcrId, userId, reportDate: date, subject: 'DOCTOR', subjectId: called[0]!._id, remarks: 'Call again next week', clientId: `work-demo:${u.employeeCode}:${date}:f0`, recordedAt: base.recordedAt });
          const exp = (type: 'TA' | 'DA' | 'OTHER', amountPaise: number, extra: Record<string, unknown> = {}) => ({ dcrId: type === 'OTHER' ? null : dcrId, userId, reportDate: date, routeId: type === 'TA' ? routeId : null, type, source: type === 'OTHER' ? 'MANUAL' : 'AUTO', amountPaise, remarks: null, paymentStatus: 'UNPAID', accepted: type !== 'OTHER', monthApproved: false, distanceFlag: false, paidBy: null, paidAt: null, clientId: type === 'OTHER' ? `work-demo:${u.employeeCode}:${date}:o` : null, recordedAt: base.recordedAt, ...extra });
          await ExpenseModel.insertMany([exp('TA', 15_000 + (k % 4) * 2_500, { distanceFlag: k === 8 }), exp('DA', 10_000), ...(k === 4 ? [exp('OTHER', 4_500, { remarks: 'Parking and toll' })] : [])]);
        });
      });
      summary.push({ mr: u.employeeCode, doctors: doctors.length, plannedDays: days.length, reportedDays: reported, noReportDays: missedDays, doctorCalls: calls });
    }
    logger.info({ month, days: days.length, summary }, apply ? 'seeding' : 'dry run');
    if (!apply) {
      logger.info('dry run: nothing was written. Run again with -- --apply.');
      return;
    }

    const ids = users.map((u) => u._id);
    const span = { $gte: `${month}-01`, $lte: yesterday };
    const plans = await DailyPlanModel.find({ userId: { $in: ids }, planDate: span }, { _id: 1 }).lean();
    const dcrs = await DcrModel.find({ userId: { $in: ids }, reportDate: span }, { _id: 1 }).lean();
    await ApprovalRequestModel.deleteMany({ kind: 'DAILY_PLAN', recordId: { $in: plans.map((p) => String(p._id)) } });
    await ApprovalRequestModel.deleteMany({ kind: 'DCR', recordId: { $in: dcrs.map((d) => String(d._id)) } });
    await DailyPlanModel.deleteMany({ _id: { $in: plans.map((p) => p._id) } });
    for (const model of [DoctorCallModel, ChemistCallModel, FollowupModel, ExpenseModel] as const) await (model as typeof DoctorCallModel).deleteMany({ userId: { $in: ids }, reportDate: span });
    await DcrModel.deleteMany({ _id: { $in: dcrs.map((d) => d._id) } });
    const oldLeaves = await LeaveModel.find({ userId: { $in: ids }, reason: 'work-demo' }, { _id: 1 }).lean();
    await ApprovalRequestModel.deleteMany({ kind: 'LEAVE', recordId: { $in: oldLeaves.map((l) => String(l._id)) } });
    await LeaveModel.deleteMany({ _id: { $in: oldLeaves.map((l) => l._id) } });
    await DoctorModel.updateMany({ _id: { $in: (await DoctorAssignmentModel.find({ userId: { $in: ids }, status: 'active' }, { doctorId: 1 }).lean()).map((h) => h.doctorId) } }, { $set: { visitFrequency: 2 } });
    for (const write of writes) await write();
    logger.info({ plans: days.length * users.length }, 'done');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  logger.error({ err }, 'seed-work-demo failed');
  process.exitCode = 1;
});
