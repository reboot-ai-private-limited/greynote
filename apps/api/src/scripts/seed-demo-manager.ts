import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';
import { DoctorAssignmentModel } from '@/modules/field-master-data/infrastructure/doctorAssignment.schema.js';
import { DoctorModel } from '@/modules/field-master-data/infrastructure/doctor.schema.js';
import { DesignationModel } from '@/modules/identity/infrastructure/designation.schema.js';
import { EmployeeProfileModel } from '@/modules/identity/infrastructure/employeeProfile.schema.js';
import { PayBandModel } from '@/modules/identity/infrastructure/payBand.schema.js';
import { RoleModel } from '@/modules/identity/infrastructure/role.schema.js';
import { UserModel } from '@/modules/identity/infrastructure/user.schema.js';
import { HqModel } from '@/modules/territory/infrastructure/hq.schema.js';
import { RouteAssignmentModel } from '@/modules/territory/infrastructure/routeAssignment.schema.js';
import { RouteModel } from '@/modules/territory/infrastructure/route.schema.js';
import { UserHqAssignmentModel } from '@/modules/territory/infrastructure/userHqAssignment.schema.js';
import { ZoneModel } from '@/modules/territory/infrastructure/zone.schema.js';

/**
 * The Google Play reviewer's demo Manager: DEMOMGR (an ASM) with two field employees under them (DEMOMR1, DEMOMR2), on a
 * demo zone, HQ and route with a few doctors. Login skips the device-approval step for demo accounts, so the reviewer is not stopped at
 * "waiting for Admin approval". Safe to run in production; the demo users carry `isDemo`, so payroll, attendance and the
 * daily jobs leave them out, and the account cannot be deleted.
 *
 *   DEMO_MANAGER_PASSWORD='…' pnpm --filter @greynote/api seed:demo-manager            create (does nothing if already there)
 *   DEMO_MANAGER_PASSWORD='…' pnpm --filter @greynote/api seed:demo-manager -- --reset-password
 *   pnpm --filter @greynote/api seed:demo-manager -- --remove                          delete every demo record again
 *
 * The password is read from the environment and never written down.
 */
const CODES = { manager: 'DEMOMGR', mrs: ['DEMOMR1', 'DEMOMR2'] } as const;
const ZONE = 'DEMO Zone';
const HQ = 'DEMO HQ';
const ROUTE = 'DEMO Route';
const PLACE = { label: 'Siliguri, West Bengal', latitude: 26.7271, longitude: 88.3953, placeId: 'demo-place-siliguri' };
const DOCTORS = [
  ['DEMO Dr. A. Sen', 'General Physician', 'MBBS'],
  ['DEMO Dr. R. Gurung', 'Paediatrician', 'MD'],
  ['DEMO Dr. S. Roy', 'Cardiologist', 'DM'],
  ['DEMO Dr. P. Thapa', 'Dermatologist', 'MD'],
  ['DEMO Dr. M. Das', 'Gynaecologist', 'MS'],
  ['DEMO Dr. K. Basnet', 'Orthopaedic', 'MS'],
] as const;

const keyOf = (s: string) => s.trim().toLowerCase();

async function remove(): Promise<void> {
  const users = await UserModel.find({ employeeCode: { $in: [CODES.manager, ...CODES.mrs] }, isDemo: true }, { _id: 1 }).lean();
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
    routes: (await RouteModel.deleteMany({ _id: { $in: routes.map((r) => r._id) } })).deletedCount,
    hqs: (await HqModel.deleteMany({ _id: { $in: hqs.map((h) => h._id) } })).deletedCount,
    zones: zone ? (await ZoneModel.deleteOne({ _id: zone._id })).deletedCount : 0,
    profiles: (await EmployeeProfileModel.deleteMany({ userId: { $in: ids } })).deletedCount,
    users: (await UserModel.deleteMany({ _id: { $in: ids } })).deletedCount,
  };
  logger.info(out, 'demo data removed');
}

async function main(): Promise<void> {
  await mongoose.connect(env.MONGO_URI);
  try {
    if (process.argv.includes('--remove')) return await remove();

    const password = process.env['DEMO_MANAGER_PASSWORD'];
    if (!password || Buffer.byteLength(password) < 8 || Buffer.byteLength(password) > 72) {
      throw new Error('Set DEMO_MANAGER_PASSWORD (8 to 72 bytes) in the environment.');
    }
    const passwordHash = await bcrypt.hash(password, 12);

    const existing = await UserModel.findOne({ employeeCode: CODES.manager });
    if (existing) {
      if (!existing.isDemo) throw new Error(`${CODES.manager} exists but is not a demo account; refusing to touch it.`);
      if (process.argv.includes('--reset-password')) {
        await UserModel.updateMany({ employeeCode: { $in: [CODES.manager, ...CODES.mrs] }, isDemo: true }, { passwordHash });
        logger.info('demo passwords reset');
      } else {
        logger.info('demo data is already there — use --remove to start again, or --reset-password');
      }
      return;
    }

    const [field, asm, mr, payBand] = await Promise.all([
      RoleModel.findOne({ name: 'FIELD' }).lean(),
      DesignationModel.findOne({ name: 'ASM' }).lean(),
      DesignationModel.findOne({ name: 'MR' }).lean(),
      PayBandModel.findOne({}).lean(),
    ]);
    if (!field) throw new Error('No FIELD role: run the main seed first.');
    if (!asm || !mr) throw new Error('The ASM and MR designations are missing: create them in the portal first.');
    const admin = await UserModel.findOne({ roleId: (await RoleModel.findOne({ name: 'ADMIN' }).lean())?._id }).lean();
    if (!admin) throw new Error('No Admin exists: run the main seed first.');

    const now = new Date();
    const zone = await ZoneModel.create({ name: ZONE, nameKey: keyOf(ZONE), status: 'active' });
    const hq = await HqModel.create({ zoneId: zone._id, name: HQ, nameKey: keyOf(HQ), basePlace: PLACE, status: 'active' });
    const route = await RouteModel.create({
      hqId: hq._id,
      name: ROUTE,
      nameKey: keyOf(ROUTE),
      type: 'HQ',
      typeSource: 'MANUAL',
      destination: PLACE,
      distanceKm: null,
      distanceSource: 'MANUAL_OVERRIDE',
      distanceStatus: 'CALCULATED',
      distanceCalculatedAt: now,
      taPerKmRateOverridePaise: null,
      revision: 1,
      status: 'active',
    });

    const make = async (employeeCode: string, name: string, designationId: mongoose.Types.ObjectId, managerId: mongoose.Types.ObjectId | null) => {
      const user = await UserModel.create({
        employeeCode,
        name,
        email: null,
        phone: null,
        status: 'active',
        roleId: field._id,
        passwordHash,
        lastLoginAt: null,
        isBlocked: false,
        isDemo: true,
      });
      await EmployeeProfileModel.create({
        userId: user._id,
        designationId,
        payBandId: payBand?._id ?? null,
        managerId,
        dateOfJoining: new Date('2025-04-01T00:00:00.000Z'),
        hqId: hq._id,
        zoneId: zone._id,
        mobileNumber: null,
        guardianName: null,
        dateOfBirth: null,
        address: null,
        qualification: null,
        bankDetails: null,
        documents: [],
      });
      await UserHqAssignmentModel.create({ userId: user._id, hqId: hq._id, status: 'active', assignedAt: now, assignedBy: admin._id, unassignedAt: null, unassignedBy: null });
      await RouteAssignmentModel.create({ routeId: route._id, userId: user._id, status: 'active', assignedAt: now, assignedBy: admin._id, unassignedAt: null, unassignedBy: null });
      return user;
    };

    const manager = await make(CODES.manager, 'Demo Manager', asm._id, null);
    const mrs = [await make(CODES.mrs[0], 'Demo MR One', mr._id, manager._id), await make(CODES.mrs[1], 'Demo MR Two', mr._id, manager._id)];

    for (const [i, [name, specialty, qualification]] of DOCTORS.entries()) {
      const doctor = await DoctorModel.create({
        routeId: route._id,
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
      await DoctorAssignmentModel.create({ doctorId: doctor._id, userId: mrs[i % 2]!._id, status: 'active', assignedAt: now, assignedBy: admin._id, unassignedAt: null, unassignedBy: null });
    }

    logger.info({ manager: CODES.manager, mrs: CODES.mrs, doctors: DOCTORS.length }, 'demo data created');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  logger.error({ err }, 'seed-demo-manager failed');
  process.exitCode = 1;
});
