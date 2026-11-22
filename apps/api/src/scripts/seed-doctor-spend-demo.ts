import mongoose, { Types } from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';
import { ApprovalRequestModel } from '@/modules/approval/infrastructure/approvalRequest.schema.js';
import { DoctorGiftModel, DoctorServiceModel } from '@/modules/field-activity/infrastructure/serviceGift.schema.js';
import { DoctorAssignmentModel } from '@/modules/field-master-data/infrastructure/doctorAssignment.schema.js';
import { DoctorModel } from '@/modules/field-master-data/infrastructure/doctor.schema.js';
import { RoleModel } from '@/modules/identity/infrastructure/role.schema.js';
import { UserModel } from '@/modules/identity/infrastructure/user.schema.js';
import { assertLocalDatabase } from './localTestData.js';

/**
 * Demo Doctor Services and Gifts, so /doctor-services and /doctor-gifts have rows in every state: MR-requested (waiting, approved, done,
 * rejected) and Admin-recorded services, and gifts that were asked for, allocated, delivered and rejected. LOCAL DATABASE ONLY.
 * Needs `seed:local-test` applied (the `TEST Dr. …` doctors and the DEMOMR* employees).
 *
 *   DOTENV_CONFIG_PATH=.env.local pnpm --filter @greynote/api seed:doctor-spend-demo            dry run
 *   DOTENV_CONFIG_PATH=.env.local pnpm --filter @greynote/api seed:doctor-spend-demo -- --apply  write
 *
 * Every row it writes starts with "[demo]" (remarks / gift name), so a re-run first removes exactly those and writes them again.
 */
const TAG = '[demo]';
const DAY = 86_400_000;

async function main(): Promise<void> {
  assertLocalDatabase(env.MONGO_URI);
  const apply = process.argv.includes('--apply');
  await mongoose.connect(env.MONGO_URI);
  try {
    const adminRole = await RoleModel.findOne({ name: 'ADMIN' }, { _id: 1 }).lean();
    const admin = adminRole && (await UserModel.findOne({ roleId: adminRole._id, status: 'active' }, { _id: 1 }).lean());
    if (!admin) throw new Error('No active Admin user found.');
    const doctors = await DoctorModel.find({ name: /^TEST Dr\./, status: 'active' }, { _id: 1, name: 1 }).sort({ name: 1 }).lean();
    const held = await DoctorAssignmentModel.find({ doctorId: { $in: doctors.map((d) => d._id) }, status: 'active' }, { doctorId: 1, userId: 1 }).lean();
    const holder = new Map(held.map((h) => [String(h.doctorId), h.userId as Types.ObjectId]));
    const withMr = doctors.filter((d) => holder.has(String(d._id)));
    if (withMr.length < 3) throw new Error('The TEST doctors are not there; run seed:local-test -- --apply first.');
    const now = Date.now();
    const at = (daysAgo: number) => new Date(now - daysAgo * DAY);
    const pick = (i: number) => withMr[i % withMr.length]!;
    const mrOf = (i: number) => holder.get(String(pick(i)._id))!;

    type Status = 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'DONE';
    const services: Array<{ i: number; type: string; rupees: number; origin: 'MR' | 'ADMIN'; status: Status; remarks: string; daysAgo: number }> = [
      { i: 0, type: 'HONORARIUM', rupees: 2724, origin: 'MR', status: 'DONE', remarks: 'ALBUCURE 6PCS; Needpro ortho 3pcs & ESOMPAS D 30 strips, to be given at the clinic on the next visit', daysAgo: 12 },
      { i: 1, type: 'CME', rupees: 750, origin: 'MR', status: 'DONE', remarks: 'Albucure powder 5PCS', daysAgo: 15 },
      { i: 2, type: 'ONLINE_PROMOTION', rupees: 5500, origin: 'MR', status: 'APPROVED', remarks: 'Due CRM payments month of September & October', daysAgo: 4 },
      { i: 3, type: 'TRAINING', rupees: 4500, origin: 'MR', status: 'SUBMITTED', remarks: 'Staff training session at the clinic', daysAgo: 2 },
      { i: 4, type: 'OTHERS', rupees: 100, origin: 'MR', status: 'REJECTED', remarks: 'Printing of visiting cards', daysAgo: 9 },
      { i: 5, type: 'CME', rupees: 12000, origin: 'ADMIN', status: 'DONE', remarks: 'Regional CME, Siliguri', daysAgo: 20 },
      { i: 0, type: 'HONORARIUM', rupees: 3000, origin: 'ADMIN', status: 'APPROVED', remarks: 'Quarterly honorarium', daysAgo: 3 },
      { i: 1, type: 'ONLINE_PROMOTION', rupees: 1999, origin: 'ADMIN', status: 'DONE', remarks: '', daysAgo: 30 },
    ];
    const gifts: Array<{ i: number; name: string; rupees: number; status: 'REQUESTED' | 'PENDING' | 'DONE' | 'REJECTED'; origin: 'ADMIN' | 'EMPLOYEE'; note?: string; reason?: string; daysAgo: number }> = [
      { i: 0, name: 'Desk clock', rupees: 800, status: 'DONE', origin: 'ADMIN', daysAgo: 14 },
      { i: 1, name: 'Wall calendar and pen set', rupees: 350, status: 'PENDING', origin: 'ADMIN', daysAgo: 5 },
      { i: 2, name: 'Prescription pad holder', rupees: 450, status: 'DONE', origin: 'EMPLOYEE', note: 'Doctor asked for it on the last visit', daysAgo: 11 },
      { i: 3, name: 'NEEDPRO HP 12 pcs', rupees: 0, status: 'REQUESTED', origin: 'EMPLOYEE', note: 'Payment in cash', daysAgo: 1 },
      { i: 4, name: 'Premium pen', rupees: 0, status: 'REJECTED', origin: 'EMPLOYEE', note: 'For the doctor’s birthday', reason: 'Over the gift budget for this quarter', daysAgo: 8 },
      { i: 5, name: 'Stethoscope', rupees: 6500, status: 'PENDING', origin: 'ADMIN', daysAgo: 2 },
    ];
    logger.info({ doctors: withMr.length, services: services.length, gifts: gifts.length }, apply ? 'writing' : 'would write');
    if (!apply) return;

    const oldServices = await DoctorServiceModel.find({ remarks: new RegExp(`^\\${TAG}`) }, { _id: 1 }).lean();
    await ApprovalRequestModel.deleteMany({ kind: 'DOCTOR_SERVICE', recordId: { $in: oldServices.map((s) => String(s._id)) } });
    await DoctorServiceModel.deleteMany({ _id: { $in: oldServices.map((s) => s._id) } });
    await DoctorGiftModel.deleteMany({ productName: new RegExp(`^\\${TAG}`) });

    for (const [n, s] of services.entries()) {
      const _id = new Types.ObjectId();
      const userId = mrOf(s.i);
      const createdBy = s.origin === 'MR' ? userId : admin._id;
      const done = s.status === 'DONE';
      await DoctorServiceModel.create({
        _id, doctorId: pick(s.i)._id, userId, createdBy, origin: s.origin, serviceType: s.type, amountPaise: s.rupees * 100,
        remarks: `${TAG} ${s.remarks}`.trim(), clientId: s.origin === 'MR' ? `doctor-spend-demo:${n}` : null, createdAt: at(s.daysAgo),
        doneBy: done ? admin._id : null, doneAt: done ? at(s.daysAgo - 1) : null,
      });
      if (s.origin === 'MR') {
        const status = s.status === 'DONE' ? 'APPROVED' : s.status;
        const decided = status !== 'SUBMITTED';
        await ApprovalRequestModel.create({
          kind: 'DOCTOR_SERVICE', recordId: String(_id), submitterId: userId, status, workflow: 'MANAGER_ONLY', cycle: 1, submittedAt: at(s.daysAgo), decidedAt: decided ? at(s.daysAgo - 1) : null,
          history: decided ? [{ action: status === 'REJECTED' ? 'REJECT' : 'APPROVE', authority: 'ADMIN', actorId: admin._id, actorRole: 'ADMIN', comment: null, at: at(s.daysAgo - 1), resultingStatus: status, cycle: 1 }] : [],
        });
      }
    }
    for (const g of gifts) {
      const mr = mrOf(g.i);
      const done = g.status === 'DONE';
      await DoctorGiftModel.create({
        doctorId: pick(g.i)._id, allocatedBy: g.origin === 'EMPLOYEE' ? mr : admin._id, productName: `${TAG} ${g.name}`, amountPaise: g.rupees * 100, status: g.status, origin: g.origin,
        requestedBy: g.origin === 'EMPLOYEE' ? mr : null, requestNote: g.note ?? null, rejectReason: g.reason ?? null,
        completedBy: done ? mr : null, completedAt: done ? at(g.daysAgo - 1) : null, allocatedAt: at(g.daysAgo),
      });
    }
    logger.info({ services: services.length, gifts: gifts.length }, 'done');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  logger.error({ err }, 'seed-doctor-spend-demo failed');
  process.exitCode = 1;
});
