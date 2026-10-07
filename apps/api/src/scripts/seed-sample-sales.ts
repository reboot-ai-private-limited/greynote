import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';

/**
 * DEVELOPMENT ONLY. Fills a development database with clearly-labelled sample sales data so the Orders page, the stock reports and the Sales chart
 * have something to show: a few distributors and chemists, a few products with prices, six-odd months of orders (mostly Done, some Placed, a few
 * Cancelled), monthly stock counts that follow from them, and accepted TA, DA and meal claims for the three sample MRs (with a daily report row to hang them on). Everything is labelled — names start with "SAMPLE", orders say "SAMPLE DATA" — so it
 * can be removed again. It refuses to run in production.
 *
 *   pnpm --filter @greynote/api seed:sample-sales                    dry run — says what it would do
 *   pnpm --filter @greynote/api seed:sample-sales -- --apply         writes (does nothing if the samples are already there)
 *   pnpm --filter @greynote/api seed:sample-sales -- --remove        deletes every sample record again
 *
 * The figures are generated, not real: for each distributor and product, opening stock is last month's closing, primary is what its Done orders
 * add up to, and closing is chosen so that secondary (opening + primary − closing) is a sensible share of what was there to sell.
 */
const TAG = 'SAMPLE DATA';
/** The time stamped on the sample route assignments, so they can be found again: nothing real is assigned at exactly this instant. */
const SAMPLE_ASSIGNED_AT = new Date('2026-04-01T00:00:00.000Z');
/** The same for the sample salary runs (their `generatedAt`). */
const SAMPLE_PAYROLL_AT = new Date('2026-04-01T00:00:00.123Z');
const PREFIX = 'SAMPLE ';

/** A small deterministic generator, so a rerun makes the same data. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

const monthsFromApril = (today: string): string[] => {
  const [y = 2026, m = 4] = today.slice(0, 7).split('-').map(Number);
  const startYear = m >= 4 ? y : y - 1;
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    const mo = ((3 + i) % 12) + 1;
    const yr = startYear + (3 + i >= 12 ? 1 : 0);
    const month = `${yr}-${String(mo).padStart(2, '0')}`;
    if (month <= today.slice(0, 7)) out.push(month);
  }
  return out;
};

/** The product that is already in the development database, reused as it is; the others below are new and labelled. */
const EXISTING_SKU = 'XYZ-500';
const SAMPLE_PRODUCTS = [
  { name: 'SAMPLE Amoxicillin 250', sku: 'SMP-AMX250', category: 'Antibiotic', composition: 'Amoxicillin 250mg', type: 'CAPSULE', packSize: '10×10', pts: 6500, ptr: 7400, mrp: 9000 },
  { name: 'SAMPLE Cetirizine 10', sku: 'SMP-CET10', category: 'Antihistamine', composition: 'Cetirizine 10mg', type: 'TABLET', packSize: '10×10', pts: 1800, ptr: 2100, mrp: 2600 },
  { name: 'SAMPLE Pantoprazole 40', sku: 'SMP-PAN40', category: 'Antacid', composition: 'Pantoprazole 40mg', type: 'TABLET', packSize: '10×10', pts: 5200, ptr: 5900, mrp: 7200 },
] as const;
const DISTRIBUTORS = ['SAMPLE Shree Distributors', 'SAMPLE Maa Tara Agencies', 'SAMPLE Himalaya Pharma Distributors'];
const CHEMISTS = ['SAMPLE Sai Medical', 'SAMPLE Lifeline Pharmacy', 'SAMPLE City Chemists', 'SAMPLE Apollo Corner'];

async function main(): Promise<void> {
  if (env.NODE_ENV === 'production') throw new Error('Sample data is for development only; this refuses to run in production.');
  const apply = process.argv.includes('--apply');
  const remove = process.argv.includes('--remove');
  await mongoose.connect(env.MONGO_URI);
  const db = mongoose.connection.db!;
  logger.info({ database: db.databaseName, mode: remove ? 'REMOVE' : apply ? 'APPLY' : 'dry run' }, 'sample sales data');

  const sampleDistributors = await db.collection('distributors').find({ name: { $regex: `^${PREFIX}` } }).toArray();
  const sampleChemists = await db.collection('chemists').find({ name: { $regex: `^${PREFIX}` } }).toArray();

  if (remove) {
    const dIds = sampleDistributors.map((d) => d._id);
    const cIds = sampleChemists.map((c) => c._id);
    const expenseDcrIds = await db.collection('expenses').distinct('dcrId', { remarks: TAG });
    const sampleDoctors = await db.collection('doctors').find({ name: { $regex: `^${PREFIX}` } }).toArray();
    const out = {
      payrollRuns: (await db.collection('payrollruns').deleteMany({ generatedAt: SAMPLE_PAYROLL_AT })).deletedCount,
      routeAssignments: (await db.collection('routeassignments').deleteMany({ assignedAt: SAMPLE_ASSIGNED_AT })).deletedCount,
      approvals: (await db.collection('approvalrequests').deleteMany({ kind: 'DCR', recordId: { $in: expenseDcrIds.map(String) } })).deletedCount,
      doctorCalls: (await db.collection('doctorcalls').deleteMany({ dcrId: { $in: expenseDcrIds } })).deletedCount,
      chemistCalls: (await db.collection('chemistcalls').deleteMany({ dcrId: { $in: expenseDcrIds } })).deletedCount,
      followups: (await db.collection('followups').deleteMany({ dcrId: { $in: expenseDcrIds } })).deletedCount,
      doctorAssignments: (await db.collection('doctorassignments').deleteMany({ doctorId: { $in: sampleDoctors.map((d) => d._id) } })).deletedCount,
      doctors: (await db.collection('doctors').deleteMany({ _id: { $in: sampleDoctors.map((d) => d._id) } })).deletedCount,
      expenses: (await db.collection('expenses').deleteMany({ remarks: TAG })).deletedCount,
      dailyReports: (await db.collection('dcrs').deleteMany({ _id: { $in: expenseDcrIds } })).deletedCount,
      orders: (await db.collection('orders').deleteMany({ remarks: TAG })).deletedCount,
      stock: (await db.collection('monthlystocks').deleteMany({ $or: [{ distributorId: { $in: dIds } }, { chemistId: { $in: cIds } }] })).deletedCount,
      distributors: (await db.collection('distributors').deleteMany({ _id: { $in: dIds } })).deletedCount,
      chemists: (await db.collection('chemists').deleteMany({ _id: { $in: cIds } })).deletedCount,
      products: (await db.collection('products').deleteMany({ name: { $regex: `^${PREFIX}` } })).deletedCount,
    };
    logger.info(out, 'sample data removed');
    return;
  }
  if (sampleDistributors.length > 0) {
    logger.info({ distributors: sampleDistributors.length }, 'sample data is already there — run with --remove first to start again');
    return;
  }

  const route = await db.collection('routes').findOne({});
  if (!route) throw new Error('There is no route to put the sample distributors on. Create one in the portal first.');
  const mrs = await db.collection('users').find({ employeeCode: { $in: ['PROMOMR1', 'PROMOMR2', 'PROMOMR3'] } }).toArray();
  const fieldRole = await db.collection('roles').findOne({ name: 'FIELD' });
  const anyMrs = mrs.length >= 3 ? mrs : await db.collection('users').find({ roleId: fieldRole?._id }).limit(3).toArray();
  if (anyMrs.length === 0) throw new Error('There is no field employee to place the sample orders. Create one first.');
  const mrFor = (i: number) => anyMrs[i % anyMrs.length]!;

  const today = new Date().toISOString().slice(0, 10);
  const months = monthsFromApril(today);
  const current = today.slice(0, 7);
  const rnd = lcg(20261007);

  // Products, prices in paise: the existing one if it is there, then the new sample ones.
  const productDocs: Array<{ id: mongoose.Types.ObjectId; pts: number; ptr: number; mrp: number }> = [];
  const existing = await db.collection('products').findOne({ skuKey: EXISTING_SKU.toLowerCase() });
  if (existing) productDocs.push({ id: existing['_id'] as mongoose.Types.ObjectId, pts: Number(existing['ptsPaise'] ?? 8000), ptr: Number(existing['ptrPaise'] ?? 9000), mrp: Number(existing['mrpPaise'] ?? 11000) });
  const newProducts = SAMPLE_PRODUCTS.map((p) => ({
    _id: new mongoose.Types.ObjectId(),
    name: p.name,
    sku: p.sku,
    skuKey: p.sku.toLowerCase(),
    category: p.category,
    composition: p.composition,
    type: p.type,
    packSize: p.packSize,
    ptsPaise: p.pts,
    ptrPaise: p.ptr,
    mrpPaise: p.mrp,
    gstPercent: 12,
    division: 'General',
    status: 'active',
  }));
  for (const [i, p] of SAMPLE_PRODUCTS.entries()) productDocs.push({ id: newProducts[i]!._id, pts: p.pts, ptr: p.ptr, mrp: p.mrp });

  const distributors = DISTRIBUTORS.map((name, i) => ({
    _id: new mongoose.Types.ObjectId(),
    routeId: route['_id'],
    name,
    gstNumber: `19ABCDE123${i}F1Z5`,
    contactPerson: ['R. Sharma', 'S. Das', 'P. Gurung'][i]!,
    mobile: `90000000${String(i + 1).padStart(2, '0')}`,
    address: `${name.slice(PREFIX.length)}, Siliguri`,
    latitude: null,
    longitude: null,
    assignedMrId: mrFor(i)['_id'],
    assignedAsmId: null,
    primarySalesEnabled: true,
    secondarySalesEnabled: true,
    status: 'active',
  }));
  const chemists = CHEMISTS.map((name, i) => ({ _id: new mongoose.Types.ObjectId(), routeId: route['_id'], name, address: `${name.slice(PREFIX.length)}, Siliguri`, latitude: null, longitude: null, status: 'active', mr: mrFor(i) }));

  // Orders to distributors, and the stock that follows from the Done ones.
  type Order = { _id: mongoose.Types.ObjectId; userId: unknown; distributorId?: unknown; chemistId?: unknown; orderDate: string; status: 'PLACED' | 'DONE' | 'CANCELLED'; totalAmountPaise: number; remarks: string; items: Array<{ productId: mongoose.Types.ObjectId; quantity: number; unitPricePaise: number; amountPaise: number }>; completedBy: unknown; completedAt: Date | null; clientId: null; createdAt: Date };
  const orders: Order[] = [];
  const stock: Array<Record<string, unknown>> = [];
  const summary: Record<string, { primary: number; secondary: number }> = {};
  const at = (date: string, hour: number) => new Date(`${date}T${String(hour).padStart(2, '0')}:00:00+05:30`);
  const mkOrder = (outlet: { distributorId?: unknown; chemistId?: unknown }, mr: { _id: unknown }, orderDate: string, status: Order['status'], lines: Array<{ p: (typeof productDocs)[number]; qty: number; price: number }>, doneOn?: string): Order => {
    const items = lines.map((l) => ({ productId: l.p.id, quantity: l.qty, unitPricePaise: l.price, amountPaise: l.qty * l.price }));
    return {
      _id: new mongoose.Types.ObjectId(),
      userId: mr._id,
      ...outlet,
      orderDate,
      status,
      totalAmountPaise: items.reduce((n, i) => n + i.amountPaise, 0),
      remarks: TAG,
      items,
      completedBy: status === 'PLACED' ? null : mr._id,
      completedAt: status === 'PLACED' ? null : at(doneOn ?? orderDate, 15),
      clientId: null,
      createdAt: at(orderDate, 11),
    };
  };

  distributors.forEach((d, di) => {
    const mr = mrFor(di);
    const opening = productDocs.map(() => 30 + Math.round(rnd() * 30));
    months.forEach((month, mi) => {
      const monthEnded = month < current;
      // How much each product is ordered this month, growing a little with the months.
      const primary = productDocs.map((_, pi) => Math.round((40 + 25 * ((di + pi) % 4)) * (1 + 0.04 * mi) * (0.8 + rnd() * 0.4)));
      const half = primary.map((q) => Math.floor(q / 2));
      // Current month: only the first week's order is Done; the rest is still Placed.
      const lastDoneDay = monthEnded ? 20 : 6;
      const days = monthEnded ? ['04', '12'] : ['02', '05'];
      const first = productDocs.map((p, pi) => ({ p, qty: half[pi]!, price: p.pts }));
      const second = productDocs.map((p, pi) => ({ p, qty: primary[pi]! - half[pi]!, price: p.pts }));
      const o1 = mkOrder({ distributorId: d._id }, mr, `${month}-${days[0]}`, 'DONE', first, `${month}-${String(Math.min(Number(days[0]) + 1, lastDoneDay)).padStart(2, '0')}`);
      orders.push(o1);
      if (monthEnded) {
        orders.push(mkOrder({ distributorId: d._id }, mr, `${month}-${days[1]}`, 'DONE', second, `${month}-${String(Number(days[1]) + 2).padStart(2, '0')}`));
        if ((mi + di) % 3 === 0) orders.push(mkOrder({ distributorId: d._id }, mr, `${month}-18`, 'CANCELLED', [{ p: productDocs[0]!, qty: 20, price: productDocs[0]!.pts }], `${month}-19`));
      } else {
        orders.push(mkOrder({ distributorId: d._id }, mr, `${month}-${days[1]}`, 'PLACED', second));
      }
      // Done primary this month, per product (the current month holds only the first, Done, order).
      const donePrimary = monthEnded ? primary : half;
      // Stock counts exist for a month that has ended — except one distributor's last month, left out on purpose to show a gap.
      const lastEnded = months.filter((m) => m < current).at(-1);
      const missing = di === 2 && month === lastEnded;
      productDocs.forEach((p, pi) => {
        const open = opening[pi]!;
        const share = 0.55 + rnd() * 0.3;
        const secondary = Math.round((open + donePrimary[pi]!) * share);
        const closing = open + donePrimary[pi]! - secondary;
        if (monthEnded) {
          if (!missing) stock.push({ distributorId: d._id, productId: p.id, month, openingQty: open, closingQty: closing, recordedBy: mr._id, recordedAt: at(`${month}-28`, 12) });
          const s = (summary[month] ??= { primary: 0, secondary: 0 });
          s.primary += donePrimary[pi]! * p.pts;
          if (!missing) s.secondary += secondary * p.ptr;
        }
        opening[pi] = closing;
      });
    });
  });

  // Chemist orders (information only) and chemist stock counts, each month opening where the last one closed.
  const chemistStock = new Map<string, number>();
  chemists.forEach((c, ci) => {
    months.forEach((month, mi) => {
      const lines = [0, 1, 2].slice(0, 2 + ((ci + mi) % 2)).map((pi) => ({ p: productDocs[pi]!, qty: 6 + Math.round(rnd() * 14), price: productDocs[pi]!.ptr }));
      const status: Order['status'] = month === current ? 'PLACED' : (ci + mi) % 5 === 0 ? 'CANCELLED' : 'DONE';
      orders.push(mkOrder({ chemistId: c._id }, c.mr, `${month}-${String(8 + ci * 3).padStart(2, '0')}`, status, lines, `${month}-${String(9 + ci * 3).padStart(2, '0')}`));
      if (month < current) {
        for (const [pi, pr] of productDocs.slice(0, 3).entries()) {
          const k = `${String(c._id)}|${String(pr.id)}`;
          const carried = chemistStock.get(k) ?? 10 + Math.round(rnd() * 10);
          // One deliberate slip, so the Stock report has an opening that is not last month's closing to show.
          const open = ci === 0 && pi === 0 && month === '2026-08' ? carried + 3 : carried;
          const closing = Math.max(0, open + Math.round(rnd() * 12) - Math.round(rnd() * 14));
          stock.push({ chemistId: c._id, productId: pr.id, month, openingQty: open, closingQty: closing, recordedBy: c.mr['_id'], recordedAt: at(`${month}-28`, 13) });
          chemistStock.set(k, closing);
        }
      }
    });
  });

  // Accepted TA, DA and a few meal claims for the three sample MRs, a day's report each. Months before last are paid on the 15th after; last month and
  // this one are accepted and unpaid. A couple of TA rows carry the "distance not calculated" flag.
  const dcrDocs: Array<Record<string, unknown>> = [];
  const expenseDocs: Array<Record<string, unknown>> = [];
  const adminUser = await db.collection('users').findOne({ roleId: (await db.collection('roles').findOne({ name: 'ADMIN' }))?._id });
  const nextMonthOf = (m: string): string => {
    const [y = 0, mo = 1] = m.split('-').map(Number);
    return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
  };
  const lastEnded = months.filter((m) => m < current).at(-1);
  for (const [mi, mr] of [0, 1, 2].map((i) => [i, mrFor(i)] as const)) {
    for (const month of months) {
      const [yy = 2026, mm = 4] = month.split('-').map(Number);
      const lastDay = month === current ? Number(today.slice(8, 10)) - 1 : new Date(Date.UTC(yy, mm, 0)).getUTCDate();
      for (let day = 1; day <= lastDay; day++) {
        const date = `${month}-${String(day).padStart(2, '0')}`;
        if (new Date(`${date}T00:00:00Z`).getUTCDay() === 0 || rnd() > 0.82) continue; // Sundays off, and the odd day without a report
        const dcrId = new mongoose.Types.ObjectId();
        dcrDocs.push({ _id: dcrId, userId: mr['_id'], reportDate: date, createdAt: at(date, 19) });
        const paid = month < (lastEnded ?? '');
        const base = { dcrId, userId: mr['_id'], reportDate: date, accepted: true, remarks: TAG, clientId: null, recordedAt: at(date, 19), paymentStatus: paid ? 'PAID' : 'UNPAID', paidBy: paid ? (adminUser?.['_id'] ?? null) : null, paidAt: paid ? at(`${nextMonthOf(month)}-15`, 11) : null };
        const flagged = rnd() < 0.04;
        expenseDocs.push({ ...base, routeId: route['_id'], type: 'TA', source: 'AUTO', amountPaise: flagged ? 1500 : 9000 + Math.round(rnd() * 36000), distanceFlag: flagged });
        expenseDocs.push({ ...base, routeId: null, type: 'DA', source: 'AUTO', amountPaise: (mi + day) % 3 === 0 ? 40000 : 20000, distanceFlag: false });
        if (rnd() < 0.1) expenseDocs.push({ ...base, routeId: null, type: 'MEAL', source: 'MANUAL', amountPaise: 3000 + Math.round(rnd() * 5000), distanceFlag: false });
      }
    }
  }

  // Doctors, calls, follow-ups and approvals for those daily reports. Each MR has twelve sample doctors (two spend most visits on a few; a couple are
  // almost never called on, so the coverage report has something to show). Most reports are approved, the last few days are only submitted, a few are
  // still drafts or were rejected, and about one in ten was submitted the day after.
  const SPECIALITIES = ['General Physician', 'Cardiology', 'ENT', 'Paediatrics', 'Gynaecology', 'Orthopaedics'];
  const doctorDocs: Array<Record<string, unknown> & { _id: mongoose.Types.ObjectId; mr: { _id: unknown } }> = [];
  const doctorsOf = new Map<string, mongoose.Types.ObjectId[]>();
  for (let mi = 0; mi < 3; mi++) {
    const mr = mrFor(mi);
    const mine: mongoose.Types.ObjectId[] = [];
    for (let k = 0; k < 12; k++) {
      const _id = new mongoose.Types.ObjectId();
      mine.push(_id);
      doctorDocs.push({ _id, mr, routeId: route['_id'], name: `${PREFIX}Dr ${['Sen', 'Ali', 'Bose', 'Roy', 'Das', 'Gupta', 'Khan', 'Paul', 'Rai', 'Thapa', 'Ghosh', 'Mitra'][k]} ${mi + 1}`, address: 'Siliguri', email: null, specialty: SPECIALITIES[(k + mi) % SPECIALITIES.length]!, qualification: 'MBBS', latitude: null, longitude: null, capturedLatitude: null, capturedLongitude: null, status: 'active', addedBy: mr['_id'], clientRequestId: null, approvedAt: at('2026-04-01', 10) });
    }
    doctorsOf.set(String(mr['_id']), mine);
  }
  const doctorCallDocs: Array<Record<string, unknown>> = [];
  const chemistCallDocs: Array<Record<string, unknown>> = [];
  const followupDocs: Array<Record<string, unknown>> = [];
  const approvalDocs: Array<Record<string, unknown>> = [];
  const geofence = () => {
    const r = rnd();
    return r < 0.9 ? 'PASS' : r < 0.94 ? 'UNVERIFIED' : r < 0.98 ? 'FAIL' : 'OVERRIDE';
  };
  let seq = 0;
  const callBase = (dcr: Record<string, unknown>, status: string) => ({ dcrId: dcr['_id'], userId: dcr['userId'], reportDate: dcr['reportDate'], workingType: 'FIELD_WORK', workWith: [], remarks: null, capturedLatitude: null, capturedLongitude: null, accuracyMeters: null, geofenceStatus: status, geofenceDistanceMeters: null, geofenceReason: status === 'UNVERIFIED' ? 'NO_GPS_READING' : null, geofenceOverriddenBy: null, geofenceOverriddenAt: null, geofenceOverrideComment: null, clientId: `sample-${++seq}`, recordedAt: dcr['createdAt'] });
  const recentCutoff = new Date(`${today}T00:00:00Z`).getTime() - 3 * 86_400_000;
  for (const dcr of dcrDocs) {
    const date = String(dcr['reportDate']);
    const userKey = String(dcr['userId']);
    const mine = doctorsOf.get(userKey)!;
    // Calls: four to seven of this MR's doctors; the last two are rarely chosen.
    const pool = mine.slice(0, 10);
    const visits = 4 + Math.floor(rnd() * 4);
    const chosen = new Set<number>();
    while (chosen.size < visits) chosen.add(Math.floor(rnd() * pool.length));
    if (rnd() < 0.03) chosen.add(10 + Math.floor(rnd() * 2));
    for (const i of chosen) doctorCallDocs.push({ ...callBase(dcr, geofence()), doctorId: (i < 10 ? pool[i] : mine[i])!, samples: [] });
    const chemistCount = 1 + Math.floor(rnd() * 3);
    for (let c = 0; c < chemistCount; c++) chemistCallDocs.push({ ...callBase(dcr, geofence()), chemistId: chemists[(c + Number(String(dcr['reportDate']).slice(8))) % chemists.length]!._id });
    if (rnd() < 0.15) followupDocs.push({ dcrId: dcr['_id'], userId: dcr['userId'], reportDate: dcr['reportDate'], subject: 'DOCTOR', subjectId: pool[Math.floor(rnd() * pool.length)], remarks: TAG, clientId: `sample-${++seq}`, recordedAt: dcr['createdAt'] });

    // The approval: a draft (no request), rejected, submitted only, or approved; submitted that evening or the next day.
    const roll = rnd();
    const isRecent = new Date(`${date}T00:00:00Z`).getTime() >= recentCutoff;
    if (!isRecent && roll < 0.05) continue; // still a draft
    const status = isRecent ? 'SUBMITTED' : roll < 0.08 ? 'REJECTED' : 'APPROVED';
    const lateDay = rnd() < 0.1;
    const submittedAt = lateDay ? at(`${new Date(new Date(`${date}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10)}`, 9) : at(date, 19);
    const decidedAt = status === 'SUBMITTED' ? null : new Date(submittedAt.getTime() + 20 * 3_600_000);
    approvalDocs.push({
      kind: 'DCR',
      recordId: String(dcr['_id']),
      submitterId: dcr['userId'],
      status,
      workflow: 'MANAGER_THEN_FINAL',
      cycle: 1,
      submittedAt,
      decidedAt,
      history: [
        { action: 'SUBMIT', authority: 'SUBMITTER', actorId: dcr['userId'], actorRole: 'FIELD', comment: null, at: submittedAt, resultingStatus: 'SUBMITTED', cycle: 1 },
        ...(status === 'SUBMITTED' ? [] : [{ action: status === 'APPROVED' ? 'APPROVE' : 'REJECT', authority: 'ADMIN_OVERRIDE', actorId: adminUser?.['_id'] ?? dcr['userId'], actorRole: 'ADMIN', comment: status === 'REJECTED' ? 'SAMPLE DATA: please correct the route' : null, at: decidedAt, resultingStatus: status, cycle: 1 }]),
      ],
    });
  }

  // Salary runs for the three sample MRs: finalized for the months before last, drafts for last month (this month's is not generated until it ends).
  const payrollDocs: Array<Record<string, unknown>> = [];
  for (const [mi, mr] of [0, 1, 2].map((i) => [i, mrFor(i)] as const)) {
    const base = [3_000_000, 3_400_000, 2_800_000][mi]!;
    for (const month of months.filter((m) => m < current)) {
      const final = month < (months.filter((m) => m < current).at(-1) ?? '');
      const leaveDays = rnd() < 0.3 ? 1 + Math.floor(rnd() * 2) : 0;
      const absentDays = rnd() < 0.35 ? 1 + Math.floor(rnd() * 3) : 0;
      const leaveDeduction = Math.round((base * leaveDays) / 30);
      const absentDeduction = Math.round((base * absentDays) / 30);
      payrollDocs.push({
        userId: mr['_id'],
        month,
        baseSalaryPaise: base,
        ctcAnnualPaise: base * 12 + Math.round(base * 12 * 0.12),
        ctcEffectiveFrom: '2026-04',
        ctcLines: [
          { code: 'BASIC', name: 'Basic', kind: 'EARNING', amountPaise: Math.round(base * 12 * 0.6), isOverridden: false },
          { code: 'OTHER', name: 'Other allowance', kind: 'EARNING', amountPaise: base * 12 - Math.round(base * 12 * 0.6), isOverridden: false },
          { code: 'EPF', name: 'EPF (employer)', kind: 'EMPLOYER_CONTRIBUTION', amountPaise: Math.round(base * 12 * 0.12), isOverridden: false },
        ],
        totalTaDaPaise: 0,
        reimbursementPaise: 0,
        esiNumber: null,
        unpaidLeaveDays: leaveDays,
        leaveDeductionPaise: leaveDeduction,
        absentDays,
        absentDeductionPaise: absentDeduction,
        netPayablePaise: base - leaveDeduction - absentDeduction,
        joinedInMonth: false,
        status: final ? 'FINALIZED' : 'DRAFT',
        generatedBy: adminUser?.['_id'] ?? mr['_id'],
        generatedAt: SAMPLE_PAYROLL_AT,
        finalizedAt: final ? at(`${nextMonthOf(month)}-02`, 12) : null,
      });
    }
  }

  const plan = { products: newProducts.length, distributors: distributors.length, chemists: chemists.length, orders: orders.length, stockCounts: stock.length, expenses: expenseDocs.length, dailyReports: dcrDocs.length, doctors: doctorDocs.length, doctorCalls: doctorCallDocs.length, chemistCalls: chemistCallDocs.length, approvals: approvalDocs.length, payrollRuns: payrollDocs.length, months: months.length };
  logger.info({ ...plan, byMonthRupees: Object.fromEntries(Object.entries(summary).map(([m, s]) => [m, { primary: Math.round(s.primary / 100), secondary: Math.round(s.secondary / 100) }])) }, apply ? 'writing' : 'dry run — repeat with --apply to write');
  if (!apply) return;

  await db.collection('products').insertMany(newProducts as never[]);
  await db.collection('distributors').insertMany(distributors as never[]);
  await db.collection('chemists').insertMany(chemists.map(({ mr: _mr, ...c }) => c) as never[]);
  await db.collection('orders').insertMany(orders as never[]);
  await db.collection('monthlystocks').insertMany(stock as never[]);
  await db.collection('dcrs').insertMany(dcrDocs as never[]);
  await db.collection('expenses').insertMany(expenseDocs as never[]);
  // The sample MRs cover the route their doctors are on (a doctor is only visible to someone who covers its route), unless they already do.
  for (const mr of [0, 1, 2].map((i) => mrFor(i))) {
    const covered = await db.collection('routeassignments').findOne({ routeId: route['_id'], userId: mr['_id'], status: 'active' });
    if (!covered) await db.collection('routeassignments').insertOne({ routeId: route['_id'], userId: mr['_id'], status: 'active', assignedAt: SAMPLE_ASSIGNED_AT, assignedBy: adminUser?.['_id'] ?? mr['_id'], unassignedAt: null, unassignedBy: null });
  }
  await db.collection('doctors').insertMany(doctorDocs.map(({ mr: _mr, ...d }) => d) as never[]);
  await db.collection('doctorassignments').insertMany(doctorDocs.map((d) => ({ doctorId: d._id, userId: d.mr._id, status: 'active', assignedAt: at('2026-04-01', 10), assignedBy: adminUser?.['_id'] ?? d.mr._id, unassignedAt: null, unassignedBy: null })) as never[]);
  await db.collection('doctorcalls').insertMany(doctorCallDocs as never[]);
  await db.collection('chemistcalls').insertMany(chemistCallDocs as never[]);
  await db.collection('followups').insertMany(followupDocs as never[]);
  await db.collection('approvalrequests').insertMany(approvalDocs as never[]);
  await db.collection('payrollruns').insertMany(payrollDocs as never[]);
  logger.info(plan, 'sample data written (remove with --remove)');
}

main()
  .catch((err) => {
    logger.error({ err }, 'sample data failed');
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
