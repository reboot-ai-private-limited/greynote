import bcrypt from 'bcrypt';
import mongoose, { Types } from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';
import { ApprovalRequestModel } from '@/modules/approval/infrastructure/approvalRequest.schema.js';
import { ChemistAssignmentModel } from '@/modules/field-master-data/infrastructure/chemistAssignment.schema.js';
import { ChemistModel } from '@/modules/field-master-data/infrastructure/chemist.schema.js';
import { DistributorModel } from '@/modules/field-master-data/infrastructure/distributor.schema.js';
import { DoctorAssignmentModel } from '@/modules/field-master-data/infrastructure/doctorAssignment.schema.js';
import { DoctorModel } from '@/modules/field-master-data/infrastructure/doctor.schema.js';
import { DesignationModel } from '@/modules/identity/infrastructure/designation.schema.js';
import { EmployeeProfileModel } from '@/modules/identity/infrastructure/employeeProfile.schema.js';
import { PayBandModel } from '@/modules/identity/infrastructure/payBand.schema.js';
import { RoleModel } from '@/modules/identity/infrastructure/role.schema.js';
import { UserModel } from '@/modules/identity/infrastructure/user.schema.js';
import { DailyPlanModel } from '@/modules/planning/infrastructure/dailyPlan.schema.js';
import { MongoMonthlyPlanAdapter } from '@/modules/planning/infrastructure/mongoMonthlyPlan.adapter.js';
import { MonthlyPlanModel } from '@/modules/planning/infrastructure/monthlyPlan.schema.js';
import { toDayDoc } from '@/modules/planning/infrastructure/planDoc.js';
import { HqModel } from '@/modules/territory/infrastructure/hq.schema.js';
import { ManagerCoverageModel } from '@/modules/territory/infrastructure/managerCoverage.schema.js';
import { RouteAssignmentModel } from '@/modules/territory/infrastructure/routeAssignment.schema.js';
import { RouteModel } from '@/modules/territory/infrastructure/route.schema.js';
import { UserHqAssignmentModel } from '@/modules/territory/infrastructure/userHqAssignment.schema.js';
import { ZoneModel } from '@/modules/territory/infrastructure/zone.schema.js';
import { assertLocalDatabase, HQS, LOCAL_TEST_PASSWORD, PEOPLE, ROUTES, TEST_MONTH, TEST_ZONE, routeName, tourPlanRoutes, workDays, type HqKey } from './localTestData.js';

/**
 * Local test data for "managers see what their team holds" and route-first planning (shape and cases: see `localTestData.ts`).
 * LOCAL DATABASE ONLY: it refuses any other `MONGO_URI`, because it sets ONE PASSWORD (`admin123`) on every active account.
 *
 *   DOTENV_CONFIG_PATH=.env.local pnpm --filter @greynote/api seed:local-test                    dry run: what it would do
 *   DOTENV_CONFIG_PATH=.env.local pnpm --filter @greynote/api seed:local-test -- --apply         write
 *   DOTENV_CONFIG_PATH=.env.local pnpm --filter @greynote/api seed:local-test -- --remove        take the test world out again
 *
 * Idempotent: the test zone marks that the world is there, and a second `--apply` only re-sets the passwords. Names are `TEST …` so they
 * never mix with real data; the real staff, doctors and routes are only touched by the password reset.
 */
const keyOf = (s: string) => s.trim().toLowerCase();
const oid = (id: unknown) => id as Types.ObjectId;
const PLACE = { latitude: 26.7271, longitude: 88.3953 };

async function main(): Promise<void> {
  assertLocalDatabase(env.MONGO_URI);
  const apply = process.argv.includes('--apply');
  const remove = process.argv.includes('--remove');
  await mongoose.connect(env.MONGO_URI);
  try {
    logger.info({ database: mongoose.connection.db!.databaseName }, remove ? 'removing the test world' : apply ? 'seeding' : 'dry run');
    if (remove) return await removeWorld(apply);
    await seed(apply);
  } finally {
    await mongoose.disconnect();
  }
}

async function seed(apply: boolean): Promise<void> {
  const active = await UserModel.countDocuments({ status: 'active' });
  const there = await ZoneModel.exists({ nameKey: keyOf(TEST_ZONE) });
  logger.info({ passwordsToSet: active, password: LOCAL_TEST_PASSWORD, testWorld: there ? 'already there' : 'will be created', routes: ROUTES.length, people: PEOPLE.length }, apply ? 'writing' : 'would write');
  if (!apply) {
    logger.info('dry run — nothing was written. Run again with -- --apply to write.');
    return;
  }

  const passwordHash = await bcrypt.hash(LOCAL_TEST_PASSWORD, 10);
  const reset = await UserModel.updateMany({ status: 'active' }, { $set: { passwordHash } });
  logger.info({ modified: reset.modifiedCount }, 'passwords set');
  // The demo people get the Pay Band of their designation, so paid leave, TA/DA and daily-report submit work for them (without one the server refuses: "no pay band assigned").
  const bands = new Map((await PayBandModel.find({}).lean()).map((b) => [b.name, b._id]));
  for (const p of PEOPLE) {
    const u = await UserModel.findOne({ employeeCode: p.code, isDemo: true }).lean();
    const band = bands.get(p.designation) ?? (p.designation === 'MR' ? (bands.get('MR DISTRIC') ?? bands.get('MR METRO CITY')) : undefined);
    if (u && band) await EmployeeProfileModel.updateOne({ userId: u._id, payBandId: null }, { $set: { payBandId: band } });
  }
  if (there) {
    logger.info('the test world is already there; only the passwords were set. Use --remove to start again.');
    return;
  }

  const [field, adminRole, designations] = await Promise.all([
    RoleModel.findOne({ name: 'FIELD' }).lean(),
    RoleModel.findOne({ name: 'ADMIN' }).lean(),
    DesignationModel.find({ name: { $in: ['ZSM', 'RSM', 'ASM', 'MR'] } }).lean(),
  ]);
  if (!field || !adminRole) throw new Error('No FIELD or ADMIN role: this is not a Greynote database.');
  const admin = await UserModel.findOne({ roleId: adminRole._id, status: 'active' }).lean();
  if (!admin) throw new Error('No active Admin user found.');
  const designationId = new Map(designations.map((d) => [d.name, oid(d._id)]));
  const now = new Date();
  const assigned = { status: 'active' as const, assignedAt: now, assignedBy: admin._id, unassignedAt: null, unassignedBy: null };

  // Territory
  const zone = await ZoneModel.create({ name: TEST_ZONE, nameKey: keyOf(TEST_ZONE), status: 'active' });
  const hq = new Map<HqKey, Types.ObjectId>();
  for (const k of Object.keys(HQS) as HqKey[]) hq.set(k, oid((await HqModel.create({ zoneId: zone._id, name: HQS[k], nameKey: keyOf(HQS[k]), status: 'active' }))._id));
  const route = new Map<string, Types.ObjectId>();
  for (const r of ROUTES) {
    const name = routeName(r);
    route.set(r.key, oid((await RouteModel.create({ hqId: hq.get(r.hq)!, name, nameKey: keyOf(name), type: r.type ?? 'HQ', typeSource: 'MANUAL', destinationName: r.destination, distanceKm: r.distanceKm ?? '12', taPerKmRateOverridePaise: null, status: 'active' }))._id));
  }

  // People: the ones that exist are moved into this tree; the missing ones are made (demo accounts: phone login skips device approval).
  const user = new Map<string, Types.ObjectId>();
  for (const p of PEOPLE) {
    const found = await UserModel.findOne({ employeeCode: p.code }).lean();
    if (found && !found.isDemo) throw new Error(`${p.code} exists but is not a demo account; refusing to touch it.`);
    const u = found ?? (await UserModel.create({ employeeCode: p.code, name: p.name, email: null, phone: null, status: 'active', roleId: field._id, passwordHash, lastLoginAt: null, isBlocked: false, isDemo: true }));
    user.set(p.code, oid(u._id));
  }
  for (const p of PEOPLE) {
    const userId = user.get(p.code)!;
    const mainHq = hq.get(p.hqs[0] ?? 'N')!;
    const profile = { designationId: designationId.get(p.designation)!, managerId: p.manager ? user.get(p.manager)! : null, hqId: mainHq, zoneId: zone._id };
    if (await EmployeeProfileModel.exists({ userId })) await EmployeeProfileModel.updateOne({ userId }, { $set: profile });
    else {
      await EmployeeProfileModel.create({ userId, payBandId: null, dateOfJoining: new Date('2025-04-01T00:00:00.000Z'), mobileNumber: null, guardianName: null, dateOfBirth: null, address: null, qualification: null, bankDetails: null, documents: [], ...profile });
    }
    await UserHqAssignmentModel.deleteMany({ userId });
    await UserHqAssignmentModel.create({ userId, hqId: mainHq, ...assigned });
    await ManagerCoverageModel.updateOne({ userId }, { $set: { hqIds: p.hqs.map((k) => hq.get(k)!), zoneIds: [zone._id], updatedAt: now, updatedBy: admin._id } }, { upsert: true });
    await RouteAssignmentModel.deleteMany({ userId, routeId: { $in: [...route.values()] } });
    for (const key of p.routes) await RouteAssignmentModel.create({ routeId: route.get(key)!, userId, ...assigned });
  }

  // Doctors: 4 on every held route, one per holder in turn; plus an unassigned one, and one whose MR does not hold its route (S3).
  const holders = (key: string) => PEOPLE.filter((p) => p.routes.includes(key)).map((p) => p.code);
  const newDoctor = async (routeKey: string, name: string, i: number) =>
    DoctorModel.create({ routeId: route.get(routeKey)!, name, address: 'Hill Cart Road, Siliguri', email: null, clinicName: `${name.slice(5)} Clinic`, phone: null, specialty: 'General Physician', qualification: 'MBBS', dateOfBirth: null, anniversary: null, visitFrequency: 2, latitude: PLACE.latitude + i * 0.002, longitude: PLACE.longitude + i * 0.002, capturedLatitude: null, capturedLongitude: null, status: 'active', addedBy: admin._id, clientRequestId: null, approvedAt: now });
  let doctors = 0;
  for (const r of ROUTES.filter((x) => x.key !== 'OUT')) {
    const who = holders(r.key);
    if (who.length === 0) continue;
    for (let i = 0; i < 4; i++) {
      const d = await newDoctor(r.key, `TEST Dr. ${r.key}-${i + 1}`, i);
      await DoctorAssignmentModel.create({ doctorId: d._id, userId: user.get(who[i % who.length]!)!, ...assigned });
      doctors++;
    }
  }
  await newDoctor('N1', 'TEST Dr. Unassigned', 5);
  const offRoute = await newDoctor('S3', 'TEST Dr. Route-not-held', 6);
  await DoctorAssignmentModel.create({ doctorId: offRoute._id, userId: user.get('DEMOMRB2')!, ...assigned });

  // Chemists: 3 on every held route, each held by every MR on the route (many MRs); plus one nobody holds.
  let chemists = 0;
  for (const r of ROUTES.filter((x) => x.key !== 'OUT')) {
    const who = holders(r.key);
    if (who.length === 0) continue;
    for (let i = 0; i < 3; i++) {
      const c = await ChemistModel.create({ routeId: route.get(r.key)!, name: `TEST Chemist ${r.key}-${i + 1}`, address: 'Sevoke Road, Siliguri', phone: '9000000000', latitude: PLACE.latitude + i * 0.001, longitude: PLACE.longitude + i * 0.001, capturedLatitude: null, capturedLongitude: null, status: 'active', addedBy: null, clientRequestId: null, approvedAt: now });
      for (const code of who) await ChemistAssignmentModel.create({ chemistId: c._id, userId: user.get(code)!, ...assigned });
      chemists++;
    }
  }
  await ChemistModel.create({ routeId: route.get('N3')!, name: 'TEST Chemist Unassigned', address: 'Sevoke Road, Siliguri', phone: null, latitude: PLACE.latitude, longitude: PLACE.longitude, capturedLatitude: null, capturedLongitude: null, status: 'active', addedBy: null, clientRequestId: null, approvedAt: now });

  // Distributors: assigned to people (visibility is by `assignedUserIds`).
  const dist = [
    { name: 'TEST Distributor North', who: ['DEMOMRA1', 'DEMOMRA2', 'DEMOMRA3'] },
    { name: 'TEST Distributor South', who: ['DEMOMRB1', 'DEMOMRB2'] },
    { name: 'TEST Distributor All', who: ['DEMOMRA1', 'DEMOMRB1', 'DEMOMRR1'] },
  ];
  for (const [i, d] of dist.entries()) {
    await DistributorModel.create({ zoneIds: [], hqIds: [], routeIds: [], name: d.name, gstNumber: `19TEST${i}234F1Z5`, contactPerson: 'Test Contact', mobile: `90000000${i}0`, address: 'Sevoke Road, Siliguri', latitude: null, longitude: null, assignedUserIds: d.who.map((c) => user.get(c)!), documents: [], openingDuesPaise: 0, status: 'active' });
  }

  // Tour Plans for the rest of November: approved, each person on the routes they may plan (a manager's are their MRs'), no Works with.
  // The day's Daily Plan is created from it as a draft, like the approval does, so today can be opened and changed.
  const monthly = new MongoMonthlyPlanAdapter();
  const days = workDays(new Date().toISOString().slice(0, 10) > `${TEST_MONTH}-01` ? new Date().toISOString().slice(0, 10) : `${TEST_MONTH}-01`);
  let tourPlans = 0;
  let dailyPlans = 0;
  for (const p of PEOPLE) {
    const picks = tourPlanRoutes(p.code, days);
    if (picks.length === 0) continue;
    const entries = picks.map((x) => ({ planDate: x.date, returnDate: null, workingType: 'FIELD_WORK' as const, dayKind: 'NORMAL' as const, workWith: [], routeIds: [String(route.get(x.routeId)!)], remarks: null }));
    const plan = await monthly.save(String(user.get(p.code)!), TEST_MONTH, entries, null);
    if (!plan) continue;
    const approver = p.manager ? user.get(p.manager)! : oid(admin._id);
    const history = [
      { action: 'SUBMIT' as const, authority: 'SUBMITTER' as const, actorId: user.get(p.code)!, actorRole: 'FIELD' as const, comment: null, at: now, resultingStatus: 'SUBMITTED' as const, cycle: 1 },
      { action: 'APPROVE' as const, authority: (p.manager ? 'MANAGER' : 'ADMIN_OVERRIDE') as 'MANAGER' | 'ADMIN_OVERRIDE', actorId: approver, actorRole: (p.manager ? 'FIELD' : 'ADMIN') as 'FIELD' | 'ADMIN', comment: null, at: now, resultingStatus: 'APPROVED' as const, cycle: 1 },
    ];
    await ApprovalRequestModel.create({ kind: 'MONTHLY_PLAN', recordId: plan.id, submitterId: user.get(p.code)!, status: 'APPROVED', workflow: 'MANAGER_ONLY', cycle: 1, submittedAt: now, decidedAt: now, history });
    tourPlans++;
    for (const e of entries) {
      const day = { workingType: e.workingType, dayKind: e.dayKind, workWith: [] as string[], routeIds: e.routeIds, remarks: null };
      await DailyPlanModel.updateOne(
        { userId: user.get(p.code)!, planDate: e.planDate },
        { $setOnInsert: { ...toDayDoc(day), source: 'MONTHLY', amendments: [], revision: 1, lateResubmits: 0, updatedAt: now } },
        { upsert: true },
      );
      dailyPlans++;
    }
  }
  logger.info({ zone: TEST_ZONE, hqs: 3, routes: ROUTES.length, people: PEOPLE.length, doctors: doctors + 2, chemists: chemists + 1, distributors: dist.length, tourPlans, dailyPlans, from: days[0], to: days.at(-1) }, 'test world created');
}

async function removeWorld(apply: boolean): Promise<void> {
  const zone = await ZoneModel.findOne({ nameKey: keyOf(TEST_ZONE) }).lean();
  const hqs = zone ? await HqModel.find({ zoneId: zone._id }, { _id: 1 }).lean() : [];
  const routes = await RouteModel.find({ hqId: { $in: hqs.map((h) => h._id) } }, { _id: 1 }).lean();
  const routeIds = routes.map((r) => r._id);
  const doctors = await DoctorModel.find({ routeId: { $in: routeIds }, name: /^TEST / }, { _id: 1 }).lean();
  const chemists = await ChemistModel.find({ routeId: { $in: routeIds }, name: /^TEST / }, { _id: 1 }).lean();
  const people = await UserModel.find({ employeeCode: { $in: PEOPLE.map((p) => p.code) }, isDemo: true }, { _id: 1, employeeCode: 1 }).lean();
  const created = PEOPLE.filter((p) => !p.existing).map((p) => p.code);
  const madeIds = people.filter((u) => created.includes(u.employeeCode)).map((u) => u._id);
  const ids = people.map((u) => u._id);
  const plans = await MonthlyPlanModel.find({ userId: { $in: ids }, planMonth: TEST_MONTH }, { _id: 1 }).lean();
  const out = { doctors: doctors.length, chemists: chemists.length, routes: routeIds.length, hqs: hqs.length, zone: zone ? 1 : 0, tourPlans: plans.length, usersMade: madeIds.length };
  logger.info(out, apply ? 'removing' : 'would remove');
  if (!apply) {
    logger.info('dry run — nothing was removed. Run again with -- --remove --apply to remove.');
    return;
  }
  const dayDocs = await DailyPlanModel.find({ userId: { $in: ids }, planDate: { $regex: `^${TEST_MONTH}` } }, { _id: 1 }).lean();
  await ApprovalRequestModel.deleteMany({ kind: 'MONTHLY_PLAN', recordId: { $in: plans.map((p) => String(p._id)) } });
  await ApprovalRequestModel.deleteMany({ kind: 'DAILY_PLAN', recordId: { $in: dayDocs.map((d) => String(d._id)) } });
  await DailyPlanModel.deleteMany({ _id: { $in: dayDocs.map((d) => d._id) } });
  await MonthlyPlanModel.deleteMany({ _id: { $in: plans.map((p) => p._id) } });
  await ChemistAssignmentModel.deleteMany({ chemistId: { $in: chemists.map((c) => c._id) } });
  await ChemistModel.deleteMany({ _id: { $in: chemists.map((c) => c._id) } });
  await DoctorAssignmentModel.deleteMany({ doctorId: { $in: doctors.map((d) => d._id) } });
  await DoctorModel.deleteMany({ _id: { $in: doctors.map((d) => d._id) } });
  await DistributorModel.deleteMany({ name: /^TEST Distributor / });
  await RouteAssignmentModel.deleteMany({ routeId: { $in: routeIds } });
  await RouteModel.deleteMany({ _id: { $in: routeIds } });
  await UserHqAssignmentModel.deleteMany({ hqId: { $in: hqs.map((h) => h._id) } });
  await HqModel.deleteMany({ _id: { $in: hqs.map((h) => h._id) } });
  if (zone) await ZoneModel.deleteOne({ _id: zone._id });
  await EmployeeProfileModel.deleteMany({ userId: { $in: madeIds } });
  await ManagerCoverageModel.deleteMany({ userId: { $in: madeIds } });
  await UserModel.deleteMany({ _id: { $in: madeIds } });
  logger.info('the test world was removed (the passwords stay as set)');
}

main().catch((err) => {
  logger.error({ err }, 'seed-local-test failed');
  process.exitCode = 1;
});
