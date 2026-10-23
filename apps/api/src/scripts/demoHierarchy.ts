import bcrypt from 'bcrypt';
import type mongoose from 'mongoose';
import { logger } from '@/shared/logging/logger.js';
import { DoctorAssignmentModel } from '@/modules/field-master-data/infrastructure/doctorAssignment.schema.js';
import { DoctorModel } from '@/modules/field-master-data/infrastructure/doctor.schema.js';
import { DesignationModel } from '@/modules/identity/infrastructure/designation.schema.js';
import { EmployeeProfileModel } from '@/modules/identity/infrastructure/employeeProfile.schema.js';
import { RoleModel } from '@/modules/identity/infrastructure/role.schema.js';
import { UserModel } from '@/modules/identity/infrastructure/user.schema.js';
import { HqModel } from '@/modules/territory/infrastructure/hq.schema.js';
import { ManagerCoverageModel } from '@/modules/territory/infrastructure/managerCoverage.schema.js';
import { RouteAssignmentModel } from '@/modules/territory/infrastructure/routeAssignment.schema.js';
import { RouteModel } from '@/modules/territory/infrastructure/route.schema.js';
import { UserHqAssignmentModel } from '@/modules/territory/infrastructure/userHqAssignment.schema.js';
import { ZoneModel } from '@/modules/territory/infrastructure/zone.schema.js';

/**
 * A demo team for the manual approval test, with a level skipped on purpose:
 *
 *   DEMOZSM ── DEMORSM ─┬─ DEMOASM ─┬─ DEMOMRA1
 *                       │           └─ DEMOMRA2
 *                       ├─ DEMOMRR1   (direct to the RSM)
 *                       └─ DEMOMRR2   (direct to the RSM)
 *
 * Territory narrows down the chain — a report's is always inside their manager's (a ZSM with no HQ named covers every HQ of the Zone, an ASM
 * or RSM with no route assigned covers every route of their HQs):
 *   ZSM  Zone "DEMO Test Zone", no HQ named        → HQ A, HQ B, HQ C and all their routes
 *   RSM  HQ A + HQ B, no route assigned            → all routes of A and B
 *   ASM  HQ A, no route assigned                   → all routes of A (A1, A2)
 *   MRA1 HQ A, route A1      MRA2 HQ A, route A2
 *   MRR1 HQ B (+A), route B1      MRR2 HQ B (+A), route B2
 * Every MR is also assigned the out-station route "DEMO Test HQ A to Kolkata" (560 km, under HQ A). The two MRs under the RSM cover HQ A as
 * well as B for that reason, so their routes stay inside their HQs and the RSM covers both.
 * Each MR has two doctors on their own route; managers have none of their own (they see their downline's). HQ C and its route are
 * covered by the ZSM only.
 *
 *   pnpm --filter @greynote/api seed:demo-hierarchy              create (does nothing if already there)
 *   pnpm --filter @greynote/api seed:demo-hierarchy -- --remove  delete every record it made
 *
 * Everyone logs in with `DEMO_PASSWORD`, or `demo1234` when it is not set. These are `isDemo` accounts: phone login skips device approval, and
 * payroll, attendance and the daily jobs leave them out. Do not run it against a production database.
 */
export const DEMO_TEAM_PASSWORD = 'demo1234';
const ZONE = 'DEMO Test Zone';
const keyOf = (s: string) => s.trim().toLowerCase();

interface Person {
  code: string;
  name: string;
  designation: 'ZSM' | 'RSM' | 'ASM' | 'MR';
  manager: string | null;
  /** HQs the person covers; the first is their main HQ. Empty for the ZSM, who covers the whole Zone. */
  hqs: string[];
  route: string | null;
}

const PEOPLE: Person[] = [
  { code: 'DEMOZSM', name: 'Demo ZSM', designation: 'ZSM', manager: null, hqs: [], route: null },
  { code: 'DEMORSM', name: 'Demo RSM', designation: 'RSM', manager: 'DEMOZSM', hqs: ['A', 'B'], route: null },
  { code: 'DEMOASM', name: 'Demo ASM', designation: 'ASM', manager: 'DEMORSM', hqs: ['A'], route: null },
  { code: 'DEMOMRA1', name: 'Demo MR A1 (under ASM)', designation: 'MR', manager: 'DEMOASM', hqs: ['A'], route: 'A1' },
  { code: 'DEMOMRA2', name: 'Demo MR A2 (under ASM)', designation: 'MR', manager: 'DEMOASM', hqs: ['A'], route: 'A2' },
  { code: 'DEMOMRR1', name: 'Demo MR R1 (direct to RSM)', designation: 'MR', manager: 'DEMORSM', hqs: ['B', 'A'], route: 'B1' },
  { code: 'DEMOMRR2', name: 'Demo MR R2 (direct to RSM)', designation: 'MR', manager: 'DEMORSM', hqs: ['B', 'A'], route: 'B2' },
];
const CODES = PEOPLE.map((p) => p.code);

const HQS = ['A', 'B', 'C'] as const;
const hqName = (k: string) => `DEMO Test HQ ${k}`;
const ROUTES = [
  { key: 'A1', hq: 'A', destination: 'Matigara' },
  { key: 'A2', hq: 'A', destination: 'Bagdogra' },
  { key: 'B1', hq: 'B', destination: 'Naxalbari' },
  { key: 'B2', hq: 'B', destination: 'Kurseong' },
  { key: 'C1', hq: 'C', destination: 'Jalpaiguri' },
  { key: 'OUT', hq: 'A', destination: 'Kolkata', type: 'OUT_STATION', distanceKm: '560' },
] as const;
/** The out-station route every demo MR is also assigned to, so a day can be planned and logged away from the HQ. */
const OUT_ROUTE = 'OUT';

const PLACE = { latitude: 26.7271, longitude: 88.3953 };
const DOCTORS: Record<string, Array<[string, string, string]>> = {
  A1: [['DEMO Dr. A. Sen', 'General Physician', 'MBBS'], ['DEMO Dr. R. Gurung', 'Paediatrician', 'MD']],
  A2: [['DEMO Dr. S. Roy', 'Cardiologist', 'DM'], ['DEMO Dr. P. Thapa', 'Dermatologist', 'MD']],
  B1: [['DEMO Dr. M. Das', 'Gynaecologist', 'MS'], ['DEMO Dr. K. Basnet', 'Orthopaedic', 'MS']],
  B2: [['DEMO Dr. T. Lama', 'ENT Specialist', 'MS'], ['DEMO Dr. N. Ghosh', 'Neurologist', 'DM']],
};

type Id = mongoose.Types.ObjectId;

export async function removeDemoHierarchy(): Promise<void> {
  const users = await UserModel.find({ employeeCode: { $in: CODES }, isDemo: true }, { _id: 1 }).lean();
  const ids = users.map((u) => u._id);
  const zone = await ZoneModel.findOne({ nameKey: keyOf(ZONE) }).lean();
  const hqs = zone ? await HqModel.find({ zoneId: zone._id }, { _id: 1 }).lean() : [];
  const routes = await RouteModel.find({ hqId: { $in: hqs.map((h) => h._id) } }, { _id: 1 }).lean();
  const doctors = await DoctorModel.find({ routeId: { $in: routes.map((r) => r._id) }, name: /^DEMO / }, { _id: 1 }).lean();
  const out = {
    doctorAssignments: (await DoctorAssignmentModel.deleteMany({ doctorId: { $in: doctors.map((d) => d._id) } })).deletedCount,
    doctors: (await DoctorModel.deleteMany({ _id: { $in: doctors.map((d) => d._id) } })).deletedCount,
    routeAssignments: (await RouteAssignmentModel.deleteMany({ userId: { $in: ids } })).deletedCount,
    hqAssignments: (await UserHqAssignmentModel.deleteMany({ userId: { $in: ids } })).deletedCount,
    coverages: (await ManagerCoverageModel.deleteMany({ userId: { $in: ids } })).deletedCount,
    routes: (await RouteModel.deleteMany({ _id: { $in: routes.map((r) => r._id) } })).deletedCount,
    hqs: (await HqModel.deleteMany({ _id: { $in: hqs.map((h) => h._id) } })).deletedCount,
    zones: zone ? (await ZoneModel.deleteOne({ _id: zone._id })).deletedCount : 0,
    profiles: (await EmployeeProfileModel.deleteMany({ userId: { $in: ids } })).deletedCount,
    users: (await UserModel.deleteMany({ _id: { $in: ids } })).deletedCount,
  };
  logger.info(out, 'demo hierarchy removed');
}

/** Creates the demo team. The caller owns the database connection. Returns the people made, for the caller to print. */
export async function seedDemoHierarchy(password: string = DEMO_TEAM_PASSWORD): Promise<Person[]> {
  const clash = await UserModel.find({ employeeCode: { $in: CODES } }, { employeeCode: 1, isDemo: 1 }).lean();
  const foreign = clash.filter((u) => !u.isDemo);
  if (foreign.length > 0) throw new Error(`${foreign.map((u) => u.employeeCode).join(', ')} exist but are not demo accounts; refusing to touch them.`);
  if (clash.length > 0) {
    logger.info('demo hierarchy is already there — use --remove to start again');
    return PEOPLE;
  }

  const [field, adminRole, designations] = await Promise.all([
    RoleModel.findOne({ name: 'FIELD' }).lean(),
    RoleModel.findOne({ name: 'ADMIN' }).lean(),
    DesignationModel.find({ name: { $in: ['ZSM', 'RSM', 'ASM', 'MR'] } }).lean(),
  ]);
  if (!field || !adminRole) throw new Error('No FIELD or ADMIN role: run the main seed first.');
  const designationId = new Map<string, Id>(designations.map((d) => [d.name, d._id as Id]));
  const missing = ['ZSM', 'RSM', 'ASM', 'MR'].filter((n) => !designationId.has(n));
  if (missing.length > 0) throw new Error(`The ${missing.join(', ')} designation(s) are missing: create them in the portal first.`);
  const admin = await UserModel.findOne({ roleId: adminRole._id }).lean();
  if (!admin) throw new Error('No Admin exists: run the main seed first.');

  const passwordHash = await bcrypt.hash(password, 12);
  const now = new Date();
  const assigned = { status: 'active' as const, assignedAt: now, assignedBy: admin._id, unassignedAt: null, unassignedBy: null };

  const zone = await ZoneModel.create({ name: ZONE, nameKey: keyOf(ZONE), status: 'active' });
  const hq = new Map<string, Id>();
  for (const k of HQS) hq.set(k, (await HqModel.create({ zoneId: zone._id, name: hqName(k), nameKey: keyOf(hqName(k)), status: 'active' }))._id);
  const route = new Map<string, Id>();
  for (const r of ROUTES) {
    const name = `${hqName(r.hq)} to ${r.destination}`;
    route.set(
      r.key,
      (await RouteModel.create({ hqId: hq.get(r.hq)!, name, nameKey: keyOf(name), type: 'type' in r ? r.type : 'HQ', typeSource: 'MANUAL', destinationName: r.destination, distanceKm: 'distanceKm' in r ? r.distanceKm : '12', taPerKmRateOverridePaise: null, status: 'active' }))._id,
    );
  }

  const user = new Map<string, Id>();
  for (const p of PEOPLE) {
    const mainHq = hq.get(p.hqs[0] ?? 'A')!;
    const u = await UserModel.create({ employeeCode: p.code, name: p.name, email: null, phone: null, status: 'active', roleId: field._id, passwordHash, lastLoginAt: null, isBlocked: false, isDemo: true });
    user.set(p.code, u._id);
    await EmployeeProfileModel.create({
      userId: u._id,
      designationId: designationId.get(p.designation)!,
      payBandId: null,
      managerId: p.manager ? user.get(p.manager)! : null,
      dateOfJoining: new Date('2025-04-01T00:00:00.000Z'),
      hqId: mainHq,
      zoneId: zone._id,
      mobileNumber: null,
      guardianName: null,
      dateOfBirth: null,
      address: null,
      qualification: null,
      bankDetails: null,
      documents: [],
    });
    await UserHqAssignmentModel.create({ userId: u._id, hqId: mainHq, ...assigned });
    // The ZSM names no HQ: the Zone alone means every HQ in it.
    await ManagerCoverageModel.create({ userId: u._id, hqIds: p.hqs.map((k) => hq.get(k)!), zoneIds: [zone._id], updatedAt: now, updatedBy: admin._id });
    if (p.route) await RouteAssignmentModel.create({ routeId: route.get(p.route)!, userId: u._id, ...assigned });
    if (p.designation === 'MR') await RouteAssignmentModel.create({ routeId: route.get(OUT_ROUTE)!, userId: u._id, ...assigned });
  }

  for (const [routeKey, doctors] of Object.entries(DOCTORS)) {
    const mr = PEOPLE.find((p) => p.route === routeKey)!;
    for (const [i, [name, specialty, qualification]] of doctors.entries()) {
      const doctor = await DoctorModel.create({
        routeId: route.get(routeKey)!,
        name,
        address: 'Hill Cart Road, Siliguri',
        email: null,
        clinicName: `${name.slice(5)} Clinic`,
        phone: null,
        specialty,
        qualification,
        dateOfBirth: null,
        anniversary: null,
        visitFrequency: 2,
        latitude: PLACE.latitude + i * 0.002,
        longitude: PLACE.longitude + i * 0.002,
        capturedLatitude: null,
        capturedLongitude: null,
        status: 'active',
        addedBy: admin._id,
        clientRequestId: null,
        approvedAt: now,
      });
      await DoctorAssignmentModel.create({ doctorId: doctor._id, userId: user.get(mr.code)!, ...assigned });
    }
  }

  logger.info({ people: CODES, doctors: Object.values(DOCTORS).flat().length }, 'demo hierarchy created');
  return PEOPLE;
}
