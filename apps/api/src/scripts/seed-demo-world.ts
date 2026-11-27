import http from 'node:http';
import bcrypt from 'bcrypt';
import mongoose, { Types } from 'mongoose';
import { env } from '@/config/env.js';
import { signAccessToken } from '@/shared/http/jwt.util.js';
import { createApp } from '../app.js';
import { assertLocalDatabase } from './localTestData.js';

/**
 * One complete demo world on the Places model (2026-11-27), for testing the web and the phone screen by screen. LOCAL DATABASE ONLY.
 *
 *   (LOG_LEVEL=warn keeps the API's request lines out of the output.)
 *   DOTENV_CONFIG_PATH=.env.local pnpm --filter @greynote/api seed:demo-world               dry run: what it would remove and make
 *   DOTENV_CONFIG_PATH=.env.local pnpm --filter @greynote/api seed:demo-world -- --apply    do it
 *
 * It keeps the DEMO people (codes `DEMO…`) and their reporting lines, removes the old TEST/DEMO zones with everything on them and the
 * DEMO people's old work (plans, reports, calls, expenses, orders, leave, requests), then builds the world through the real API, run
 * in-process with each person's token: zone, HQs, places with km, routes, HQs of people, doctors, chemists, distributors, requests
 * from the phone, and an approved December Tour Plan. A step the API refuses is printed at the end as a finding. Every DEMO login's
 * password becomes `demo1234`. Real staff and real data are never touched. Running it again rebuilds the demo world from scratch.
 */
const PASSWORD = 'demo1234';
const OLD_ZONES = ['TEST East', 'DEMO Zone', 'DEMO Test Zone'];
const ZONE = 'DEMO North Bengal';
const PLAN_MONTH = '2026-12';

type RouteType = 'HQ' | 'EX_STATION' | 'OUT_STATION';
interface HqSpec {
  name: string;
  at: [number, number];
  places: Array<{ name: string; type: RouteType; km: string }>;
  /** A place ↔ place route inside the HQ. */
  link: [string, string, string];
  people: string[];
}
const HQS: HqSpec[] = [
  {
    name: 'DEMO Siliguri',
    at: [26.7271, 88.3953],
    places: [
      { name: 'Naxalbari', type: 'EX_STATION', km: '25' },
      { name: 'Bagdogra', type: 'HQ', km: '14' },
      { name: 'Matigara', type: 'HQ', km: '8' },
      { name: 'Kurseong', type: 'OUT_STATION', km: '32' },
    ],
    link: ['Bagdogra', 'Naxalbari', '13'],
    people: ['DEMOZSM', 'DEMORSM', 'DEMOASM', 'DEMOMRA1', 'DEMOMRA2', 'DEMOMRA3'],
  },
  {
    name: 'DEMO Jalpaiguri',
    at: [26.5167, 88.7167],
    places: [
      { name: 'Mainaguri', type: 'EX_STATION', km: '22' },
      { name: 'Dhupguri', type: 'OUT_STATION', km: '45' },
      { name: 'Rajganj', type: 'EX_STATION', km: '18' },
    ],
    link: ['Mainaguri', 'Dhupguri', '24'],
    people: ['DEMOASM2', 'DEMOMRB1', 'DEMOMRB2'],
  },
  {
    name: 'DEMO Malda',
    at: [25.0108, 88.1411],
    places: [
      { name: 'English Bazar', type: 'HQ', km: '5' },
      { name: 'Gazole', type: 'EX_STATION', km: '28' },
      { name: 'Kaliachak', type: 'OUT_STATION', km: '40' },
    ],
    link: ['English Bazar', 'Gazole', '26'],
    people: ['DEMOMRR1', 'DEMOMRR2'],
  },
  {
    name: 'DEMO Cooch Behar',
    at: [26.3452, 89.4482],
    places: [
      { name: 'Dinhata', type: 'EX_STATION', km: '23' },
      { name: 'Mathabhanga', type: 'EX_STATION', km: '30' },
      { name: 'Tufanganj', type: 'OUT_STATION', km: '42' },
    ],
    link: ['Dinhata', 'Tufanganj', '35'],
    people: ['DEMOMGR', 'DEMOMR1', 'DEMOMR2', 'DEMOMR3'],
  },
];
/** Two HQ towns joined for a manager's trip. */
const BETWEEN_HQS: [string, string, string] = ['DEMO Siliguri', 'DEMO Jalpaiguri', '42'];
const OFFICE = [
  { code: 'DEMOHR', name: 'Demo HR', role: 'HR' },
  { code: 'DEMOACC', name: 'Demo Accountant', role: 'ACCOUNTANT' },
];

const FIRST = ['Amit', 'Sutapa', 'Rajib', 'Moumita', 'Partha', 'Ananya', 'Subhash', 'Rina', 'Debasis', 'Kakali', 'Arindam', 'Payel', 'Sanjoy', 'Tania', 'Bikash', 'Mithu'];
const LAST = ['Sarkar', 'Roy', 'Ghosh', 'Saha', 'Das', 'Paul', 'Barman', 'Dey', 'Mondal', 'Chakraborty', 'Bose', 'Kundu'];
const QUALIFICATIONS = ['MBBS', 'MBBS, MD', 'MBBS, MS', 'BDS', 'MBBS, DCH', 'MBBS, DGO'];
const SHOPS = ['Medicare', 'Jeevan Deep', 'Sanjivani', 'Apollo Seva', 'Maa Tara', 'Lifeline', 'Arogya', 'Swasthya'];

const apply = process.argv.includes('--apply');
const findings: string[] = [];
const oid = (s: string) => new Types.ObjectId(s);

async function main(): Promise<void> {
  assertLocalDatabase(env.MONGO_URI);
  await mongoose.connect(env.MONGO_URI);
  const db = mongoose.connection.db!;
  const users = db.collection('users');
  const roles = new Map((await db.collection('roles').find().toArray()).map((r) => [String(r.name), r._id]));
  const roleName = new Map([...roles].map(([n, id]) => [String(id), n]));
  const demo = await users.find({ employeeCode: /^DEMO/ }).toArray();
  const demoIds = demo.map((u) => u._id);

  // ---- What goes
  const oldZones = await db.collection('zones').find({ name: { $in: OLD_ZONES } }).toArray();
  const oldHqIds = (await db.collection('hqs').find({ zoneId: { $in: oldZones.map((z) => z._id) } }).toArray()).map((h) => h._id);
  const oldRouteIds = (await db.collection('routes').find({ hqId: { $in: oldHqIds } }).toArray()).map((r) => r._id);
  const oldPlaceIds = (await db.collection('places').find({ hqId: { $in: oldHqIds } }).toArray()).map((p) => p._id);
  const onOld = { $or: [{ routeId: { $in: oldRouteIds } }, { placeId: { $in: oldPlaceIds } }] };
  // The demo world's own records (their phones start 7000) are made fresh on every run, so a re-run is a clean rebuild.
  const ours = { phone: /^7000[1245]/ };
  const oldDoctorIds = (await db.collection('doctors').find({ $or: [onOld, ours] }).toArray()).map((d) => d._id);
  const oldChemistIds = (await db.collection('chemists').find({ $or: [onOld, ours] }).toArray()).map((c) => c._id);
  const mine = { userId: { $in: demoIds } };
  const removals: Array<{ what: string; collection: string; filter: object }> = [
    { what: 'the DEMO people’s daily plans', collection: 'dailyplans', filter: mine },
    { what: 'the DEMO people’s Tour Plans', collection: 'monthlyplans', filter: mine },
    { what: 'the DEMO people’s daily reports', collection: 'dcrs', filter: mine },
    { what: 'the DEMO people’s doctor calls', collection: 'doctorcalls', filter: mine },
    { what: 'the DEMO people’s chemist calls', collection: 'chemistcalls', filter: mine },
    { what: 'the DEMO people’s expenses', collection: 'expenses', filter: mine },
    { what: 'the DEMO people’s expense months', collection: 'expensemonths', filter: mine },
    { what: 'the DEMO people’s leave', collection: 'leaves', filter: mine },
    { what: 'the DEMO people’s orders', collection: 'orders', filter: { $or: [{ userId: { $in: demoIds } }, { createdBy: { $in: demoIds } }] } },
    { what: 'requests the DEMO people sent', collection: 'approvalrequests', filter: { submitterId: { $in: demoIds } } },
    { what: 'demo distributors', collection: 'distributors', filter: { name: / \(DEMO\)$/ } },
    { what: 'demo visuals', collection: 'visuals', filter: { publicId: /^greynote\/demo-world\// } },
    { what: 'doctors on the old demo places, and the demo world’s own', collection: 'doctors', filter: { _id: { $in: oldDoctorIds } } },
    { what: 'their doctor holdings', collection: 'doctorassignments', filter: { doctorId: { $in: oldDoctorIds } } },
    { what: 'chemists on the old demo places, and the demo world’s own', collection: 'chemists', filter: { _id: { $in: oldChemistIds } } },
    { what: 'their chemist holdings', collection: 'chemistassignments', filter: { chemistId: { $in: oldChemistIds } } },
  ];
  console.warn(`\nKeeps ${demo.length} DEMO people: ${demo.map((u) => u.employeeCode).join(', ')}`);
  console.warn('\nRemoves:');
  console.warn(`  zones ${oldZones.map((z) => z.name).join(', ') || '(none left)'}, with ${oldHqIds.length} HQs, ${oldPlaceIds.length} places and ${oldRouteIds.length} routes`);
  for (const r of removals) console.warn(`  ${String(await db.collection(r.collection).countDocuments(r.filter)).padStart(4)} ${r.what}`);
  console.warn(`\nMakes: zone ${ZONE}, ${HQS.length} HQs, ${HQS.reduce((n, h) => n + h.places.length, 0)} places, about 8 doctors and 3 chemists per MR, distributors, visuals, a ${PLAN_MONTH} Tour Plan for everyone, office users ${OFFICE.map((o) => o.code).join(', ')}; password ${PASSWORD}.`);
  if (!apply) {
    console.warn('\nDry run. Add -- --apply to do it.');
    await mongoose.disconnect();
    return;
  }

  // ---- Remove the old world
  for (const r of removals) await db.collection(r.collection).deleteMany(r.filter);

  // ---- People: office users and passwords
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  for (const o of OFFICE) {
    if (!(await users.findOne({ employeeCode: o.code }))) {
      await users.insertOne({ employeeCode: o.code, name: o.name, email: null, phone: null, status: 'active', roleId: roles.get(o.role), passwordHash, lastLoginAt: null, isBlocked: false, deactivatedAt: null, deletedAt: null, isDemo: true, __v: 0 });
    }
  }
  await users.updateMany({ employeeCode: /^DEMO/ }, { $set: { passwordHash, isBlocked: false } });

  // ---- The API, in-process
  const app = createApp();
  const server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  const all = await users.find({ $or: [{ employeeCode: /^DEMO/ }, { employeeCode: 'ADMIN01' }] }).toArray();
  const idOf = new Map(all.map((u) => [String(u.employeeCode), String(u._id)]));
  const tokenOf = new Map(all.map((u) => [String(u.employeeCode), signAccessToken({ sub: String(u._id), role: (roleName.get(String(u.roleId)) ?? 'FIELD') as 'ADMIN', employeeCode: String(u.employeeCode) })]));
  const call = (who: string, method: string, url: string, body?: unknown) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the API answers many shapes; the seed reads a few fields
    new Promise<{ status: number; data: any; message: string }>((resolve, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const req = http.request(
        `http://127.0.0.1:${port}/api${url}`,
        { method, headers: { authorization: `Bearer ${tokenOf.get(who)}`, ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}) } },
        (res) => {
          let raw = '';
          res.on('data', (c: Buffer) => (raw += c.toString()));
          res.on('end', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- parsed JSON
            let parsed: any = null;
            try {
              parsed = JSON.parse(raw);
            } catch {
              parsed = null;
            }
            const details = parsed?.error?.details ? ` ${JSON.stringify(parsed.error.details).slice(0, 300)}` : '';
            resolve({ status: res.statusCode ?? 0, data: parsed?.data ?? null, message: `${parsed?.error?.message ?? parsed?.message ?? raw.slice(0, 200)}${details}` });
          });
        },
      );
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  /** A call that must work: a refusal is a finding, and the step's answer is null. */
  const must = async (step: string, who: string, method: string, url: string, body?: unknown) => {
    const r = await call(who, method, url, body);
    if (r.status >= 400) {
      findings.push(`${step} (${who} ${method} ${url}): ${r.status} ${r.message}`);
      return null;
    }
    return r.data;
  };

  for (const zone of oldZones) await must(`delete old zone ${zone.name}`, 'ADMIN01', 'DELETE', `/territory/zones/${String(zone._id)}`);

  // ---- Territory
  let zone = await db.collection('zones').findOne({ name: ZONE });
  if (!zone) {
    const made = await must('make the zone', 'ADMIN01', 'POST', '/territory/zones', { name: ZONE });
    zone = made ? await db.collection('zones').findOne({ _id: oid(made.id) }) : null;
  }
  if (!zone) throw new Error(`Could not make ${ZONE}: ${findings.join('\n')}`);
  const hqId = new Map<string, string>();
  const placeId = new Map<string, string>(); // "HQ|place" and "HQ|" for the town
  for (const spec of HQS) {
    let hq = await db.collection('hqs').findOne({ name: spec.name, zoneId: zone._id });
    if (!hq) {
      const made = await must(`make HQ ${spec.name}`, 'ADMIN01', 'POST', '/territory/hqs', { zoneId: String(zone._id), name: spec.name });
      hq = made ? await db.collection('hqs').findOne({ _id: oid(made.id) }) : null;
    }
    if (!hq) continue;
    hqId.set(spec.name, String(hq._id));
    const town = await db.collection('places').findOne({ hqId: hq._id, isHqTown: true });
    if (town) placeId.set(`${spec.name}|`, String(town._id));
    else findings.push(`HQ ${spec.name} has no HQ town place after it was made`);
    for (const p of spec.places) {
      let place = await db.collection('places').findOne({ hqId: hq._id, name: p.name });
      if (!place) {
        const made = await must(`add place ${p.name}`, 'ADMIN01', 'POST', '/territory/places', { hqId: String(hq._id), name: p.name, type: p.type, distanceKm: p.km });
        place = made ? await db.collection('places').findOne({ _id: oid(made.id ?? made.place?.id) }) : await db.collection('places').findOne({ hqId: hq._id, name: p.name });
      }
      if (place) placeId.set(`${spec.name}|${p.name}`, String(place._id));
    }
  }
  const linkRoute = async (step: string, from: string | undefined, to: string | undefined, km: string) => {
    if (!from || !to) return findings.push(`${step}: a place is missing`);
    const exists = await db.collection('routes').findOne({ $or: [{ fromPlaceId: oid(from), toPlaceId: oid(to) }, { fromPlaceId: oid(to), toPlaceId: oid(from) }] });
    if (!exists) await must(step, 'ADMIN01', 'POST', '/territory/routes', { fromPlaceId: from, toPlaceId: to, distanceKm: km });
    return 0;
  };
  for (const spec of HQS) await linkRoute(`route ${spec.link[0]} ↔ ${spec.link[1]}`, placeId.get(`${spec.name}|${spec.link[0]}`), placeId.get(`${spec.name}|${spec.link[1]}`), spec.link[2]);
  await linkRoute(`route ${BETWEEN_HQS[0]} ↔ ${BETWEEN_HQS[1]}`, placeId.get(`${BETWEEN_HQS[0]}|`), placeId.get(`${BETWEEN_HQS[1]}|`), BETWEEN_HQS[2]);

  // ---- Where people are based
  for (const spec of HQS) {
    const h = hqId.get(spec.name);
    if (!h) continue;
    for (const code of spec.people) {
      const userId = idOf.get(code);
      if (!userId) continue;
      await must(`set ${code}'s HQ`, 'ADMIN01', 'PUT', `/territory/users/${userId}/hq`, { hqId: h });
      await db.collection('employeeprofiles').updateOne({ userId: oid(userId) }, { $set: { hqId: oid(h), zoneId: zone._id } });
    }
  }

  // ---- Doctors and chemists, held by each MR
  const specialties = (await db.collection('specialties').find({ status: 'active' }).toArray()).map((s) => String(s.name));
  const designations = new Map((await db.collection('designations').find().toArray()).map((d) => [String(d._id), Number(d.level)]));
  const levelOf = new Map<string, number>();
  for (const u of demo) {
    const p = await db.collection('employeeprofiles').findOne({ userId: u._id });
    levelOf.set(String(u.employeeCode), designations.get(String(p?.designationId)) ?? 1);
  }
  let n = 0;
  const near = (at: [number, number], i: number) => ({ latitude: Number((at[0] + ((i % 7) - 3) * 0.011).toFixed(6)), longitude: Number((at[1] + ((i % 5) - 2) * 0.013).toFixed(6)) });
  for (const spec of HQS) {
    const spots = [`${spec.name}|`, ...spec.places.map((p) => `${spec.name}|${p.name}`)].map((k) => placeId.get(k)).filter((x): x is string => Boolean(x));
    const area = (pid: string) => (pid === placeId.get(`${spec.name}|`) ? spec.name.replace('DEMO ', '') : (spec.places.find((p) => placeId.get(`${spec.name}|${p.name}`) === pid)?.name ?? ''));
    for (const code of spec.people.filter((c) => levelOf.get(c) === 1)) {
      const holder = idOf.get(code)!;
      for (let i = 0; i < 8; i += 1) {
        n += 1;
        const phone = `70001${String(n).padStart(5, '0')}`;
        if (await db.collection('doctors').findOne({ phone })) continue;
        const pid = spots[i % spots.length]!;
        await must(`doctor for ${code}`, 'ADMIN01', 'POST', '/field-master-data/doctors', {
          placeId: pid,
          name: `Dr ${FIRST[n % FIRST.length]} ${LAST[(n * 7) % LAST.length]}`,
          address: `${area(pid)} main road, near bus stand`,
          specialty: specialties[n % specialties.length] ?? 'GENERAL PHYCIAN',
          qualification: QUALIFICATIONS[n % QUALIFICATIONS.length],
          clinicName: i % 2 === 0 ? `${area(pid)} Clinic` : null,
          phone,
          visitFrequency: (i % 4) + 1,
          location: near(spec.at, n),
          assignToUserId: holder,
        });
      }
      for (let i = 0; i < 3; i += 1) {
        n += 1;
        const phone = `70002${String(n).padStart(5, '0')}`;
        if (await db.collection('chemists').findOne({ phone })) continue;
        const pid = spots[(i + 1) % spots.length]!;
        await must(`chemist for ${code}`, 'ADMIN01', 'POST', '/field-master-data/chemists', {
          placeId: pid,
          name: `${SHOPS[n % SHOPS.length]} Medical Hall, ${area(pid)}`,
          address: `${area(pid)} market`,
          phone,
          location: near(spec.at, n + 3),
          assignToUserId: holder,
        });
      }
    }
    // Distributors: one for the HQ, handed to its MRs.
    const distName = `${spec.name.replace('DEMO ', '')} Pharma Distributors (DEMO)`;
    if (!(await db.collection('distributors').findOne({ name: distName }))) {
      const h = hqId.get(spec.name);
      if (h)
        await must(`distributor ${distName}`, 'ADMIN01', 'POST', '/field-master-data/distributors', {
          hqIds: [h],
          name: distName,
          gstNumber: `19AADCD${String(1000 + HQS.indexOf(spec))}${'KLMN'[HQS.indexOf(spec)]}1Z${HQS.indexOf(spec) + 1}`,
          contactPerson: `${FIRST[HQS.indexOf(spec) + 3]} ${LAST[HQS.indexOf(spec) + 2]}`,
          mobile: `70003${String(HQS.indexOf(spec) + 1).padStart(5, '0')}`,
          address: `${spec.name.replace('DEMO ', '')} wholesale market`,
          location: { latitude: spec.at[0], longitude: spec.at[1] },
          assignedUserIds: spec.people.filter((c) => levelOf.get(c) === 1).map((c) => idOf.get(c)!),
        });
    }
  }

  // ---- Requests from the phone, waiting for the manager
  const siliguriTown = placeId.get('DEMO Siliguri|');
  const naxalbari = placeId.get('DEMO Siliguri|Naxalbari');
  if (siliguriTown && naxalbari) {
    for (const [i, pid] of [siliguriTown, naxalbari].entries()) {
      const phone = `70004${String(i + 1).padStart(5, '0')}`;
      if (!(await db.collection('doctors').findOne({ phone })))
        await must('a doctor added from the phone', 'DEMOMRA1', 'POST', '/field-master-data/doctors/added', {
          placeId: pid,
          name: `Dr ${['Shyamal Kar', 'Nandini Pal'][i]}`,
          address: 'Hill Cart road',
          specialty: specialties[i] ?? 'GENERAL PHYCIAN',
          qualification: 'MBBS',
          phone,
          visitFrequency: 2,
          location: near(HQS[0]!.at, 40 + i),
          clientRequestId: `demo-world-doctor-${i + 1}`,
        });
    }
    if (!(await db.collection('chemists').findOne({ phone: '7000500001' })))
      await must('a chemist added from the phone', 'DEMOMRA1', 'POST', '/field-master-data/chemists/added', {
        placeId: naxalbari,
        name: 'New Life Medicos, Naxalbari',
        address: 'Naxalbari station road',
        phone: '7000500001',
        location: near(HQS[0]!.at, 45),
        clientRequestId: 'demo-world-chemist-1',
      });
  }

  // ---- Visuals: reuse stored images, never their storage id (so changing a demo visual can't remove a real image)
  const source = await db.collection('visuals').find({ status: 'active', category: 'E_DETAILING' }).limit(6).toArray();
  const visuals: Array<{ title: string; category: string; productFrom?: number }> = [
    { title: 'DEMO Winter campaign', category: 'CAMPAIGN_CREATIVE' },
    { title: 'DEMO Doctors’ day campaign', category: 'CAMPAIGN_CREATIVE' },
    { title: 'DEMO Greynote branding', category: 'BRANDING' },
    { title: 'DEMO product detail 1', category: 'E_DETAILING', productFrom: 3 },
    { title: 'DEMO product detail 2', category: 'E_DETAILING', productFrom: 4 },
  ];
  const admin = await users.findOne({ employeeCode: 'ADMIN01' });
  for (const [i, v] of visuals.entries()) {
    const from = source[v.productFrom ?? i % Math.max(source.length, 1)];
    if (!from) {
      findings.push('no stored visual image to reuse for the demo visuals');
      break;
    }
    if (await db.collection('visuals').findOne({ title: v.title })) continue;
    await db.collection('visuals').insertOne({
      productId: v.productFrom === undefined ? null : (from.productId ?? null),
      title: v.title,
      category: v.category,
      fileUrl: from.fileUrl,
      publicId: `greynote/demo-world/${i + 1}`,
      mimeType: from.mimeType,
      uploadedBy: admin?._id ?? null,
      status: 'active',
      createdAt: new Date(),
      __v: 0,
    });
  }

  // ---- December Tour Plan: saved and sent by each person, then approved up the line
  const daysIn = new Date(Date.UTC(2026, 12, 0)).getUTCDate();
  for (const spec of HQS) {
    const town = placeId.get(`${spec.name}|`);
    const spots = spec.places.map((p) => placeId.get(`${spec.name}|${p.name}`)).filter((x): x is string => Boolean(x));
    if (!town || spots.length === 0) continue;
    for (const code of spec.people) {
      const isMr = levelOf.get(code) === 1;
      const team = spec.people.filter((c) => c !== code && (levelOf.get(c) ?? 1) < (levelOf.get(code) ?? 1));
      const entries: Array<{ planDate: string; workingType: string; remarks?: string; fromPlaceId?: string; toPlaceId?: string; workWith?: string[] }> = [];
      for (let d = 1, f = 0; d <= daysIn; d += 1) {
        const date = `${PLAN_MONTH}-${String(d).padStart(2, '0')}`;
        if (new Date(`${date}T00:00:00Z`).getUTCDay() === 0) continue; // Sunday off
        if (d === 5 || d === 19) {
          entries.push({ planDate: date, workingType: 'MEETING', remarks: 'Monthly meeting at HQ' });
          continue;
        }
        const to = f % 3 === 2 ? town : spots[f % spots.length]!;
        f += 1;
        entries.push({
          planDate: date,
          workingType: 'FIELD_WORK',
          fromPlaceId: town,
          toPlaceId: to,
          ...(!isMr && team.length > 0 ? { workWith: [idOf.get(team[f % team.length]!)!] } : {}),
        });
      }
      // A holiday or day off can't be planned: the server names the day, and it is left out.
      let plan = entries;
      let reply = await call(code, 'POST', '/planning/monthly', { planMonth: PLAN_MONTH, entries: plan });
      for (let tries = 0; reply.status === 400 && tries < 10; tries += 1) {
        const day = /\b(\d{1,2}) Dec\b/.exec(reply.message)?.[1];
        if (!day) break;
        plan = plan.filter((e) => e.planDate !== `${PLAN_MONTH}-${day.padStart(2, '0')}`);
        reply = await call(code, 'POST', '/planning/monthly', { planMonth: PLAN_MONTH, entries: plan });
      }
      if (reply.status >= 400) findings.push(`save ${code}'s ${PLAN_MONTH} Tour Plan: ${reply.status} ${reply.message}`);
      const saved = reply.status < 400 ? reply.data : null;
      const planId = saved ? String((await db.collection('monthlyplans').findOne({ userId: oid(idOf.get(code)!), planMonth: PLAN_MONTH }))?._id ?? '') : '';
      if (planId) await must(`send ${code}'s Tour Plan`, code, 'POST', `/planning/monthly/${planId}/submit`);
    }
  }
  const approvers = ['DEMOMGR', 'DEMOASM', 'DEMOASM2', 'DEMORSM', 'DEMOZSM', 'ADMIN01'];
  for (let round = 0; round < 4; round += 1) {
    let approved = 0;
    for (const who of approvers) {
      const inbox = await call(who, 'GET', '/approvals/inbox?page=1&pageSize=100');
      for (const item of (inbox.data?.items ?? []) as Array<{ id: string; kind: string; cycle: number; submitter: { employeeCode?: string } | null }>) {
        if (item.kind !== 'MONTHLY_PLAN' || !String(item.submitter?.employeeCode ?? '').startsWith('DEMO')) continue;
        if (await must(`approve ${item.submitter?.employeeCode}'s Tour Plan`, who, 'POST', `/approvals/${item.id}/approve`, { cycle: item.cycle })) approved += 1;
      }
    }
    if (approved === 0) break;
  }

  // ---- Logins
  console.warn(`\nLogins (password ${PASSWORD}):`);
  const people = await users.find({ employeeCode: /^DEMO/ }).sort({ employeeCode: 1 }).toArray();
  for (const u of people) {
    const hqA = await db.collection('userhqassignments').findOne({ userId: u._id, status: 'active' });
    const hq = hqA ? await db.collection('hqs').findOne({ _id: hqA.hqId }) : null;
    const [doctors, chemists] = await Promise.all([
      db.collection('doctorassignments').countDocuments({ userId: u._id, status: 'active' }),
      db.collection('chemistassignments').countDocuments({ userId: u._id, status: 'active' }),
    ]);
    const plan = await db.collection('monthlyplans').findOne({ userId: u._id, planMonth: PLAN_MONTH });
    const request = plan ? await db.collection('approvalrequests').findOne({ kind: 'MONTHLY_PLAN', recordId: String(plan._id) }) : null;
    console.warn(
      `  ${String(u.employeeCode).padEnd(9)} ${String(roleName.get(String(u.roleId))).padEnd(10)} ${String(hq?.name ?? '—').padEnd(17)} doctors ${String(doctors).padStart(2)}  chemists ${String(chemists).padStart(2)}  ${PLAN_MONTH} plan ${request?.status ?? (plan ? 'saved' : '—')}   ${u.name}`,
    );
  }
  console.warn(findings.length === 0 ? '\nNo findings: every step worked.' : `\n${findings.length} finding(s), the API refused:\n${findings.map((f) => `  - ${f}`).join('\n')}`);
  server.close();
  await mongoose.disconnect();
}

main().catch(async (error: unknown) => {
  console.error(error);
  await mongoose.disconnect();
  process.exitCode = 1;
});
