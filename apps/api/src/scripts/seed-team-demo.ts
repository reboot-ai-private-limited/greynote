import { createHash } from 'node:crypto';
import { env } from '@/config/env.js';
import { assertLocalDatabase, LOCAL_TEST_PASSWORD } from './localTestData.js';

/**
 * Things to approve under DEMORSM, so every kind of request has something in it and you can click through it and find bugs. It does NOT write
 * to the database: it logs in as the demo people and does the real actions through the local API (the same endpoints and sync records the phone
 * uses), so any bug in those flows shows up here as a refusal or a 500. LOCAL ONLY: it refuses a MONGO_URI that is not 127.0.0.1 and an API that
 * is not localhost. Needs the local API running (`pnpm --filter @greynote/api dev:local`) and the seed from `seed:local-test` already applied.
 *
 *   DOTENV_CONFIG_PATH=.env.local pnpm --filter @greynote/api seed:team-demo               dry run: the list of what it would do
 *   DOTENV_CONFIG_PATH=.env.local pnpm --filter @greynote/api seed:team-demo -- --apply    do it
 *
 * Safe to run again: records carry fixed client ids, so what already exists is skipped or answered "already". The last lines of the output list
 * everything the API refused: those are your first bugs.
 */
const API = process.env.TEAM_DEMO_API ?? 'http://127.0.0.1:3100/api';
const PEOPLE = {
  rsm: 'DEMORSM',
  asm: 'DEMOASM',
  asm2: 'DEMOASM2',
  a1: 'DEMOMRA1',
  a2: 'DEMOMRA2',
  a3: 'DEMOMRA3',
  b1: 'DEMOMRB1',
  r1: 'DEMOMRR1',
  r2: 'DEMOMRR2',
  admin: 'ADMIN01',
} as const;
type Who = keyof typeof PEOPLE;

interface Reply {
  status: number;
  data: any;
  message: string;
  raw: any;
}

const tokens = new Map<string, string>();
async function login(code: string): Promise<string> {
  const hit = tokens.get(code);
  if (hit) return hit;
  const r = await fetch(`${API}/identity/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Client': 'mobile' },
    body: JSON.stringify({ employeeCode: code, password: LOCAL_TEST_PASSWORD, deviceId: `team-demo-${code}`, deviceName: 'team-demo', deviceModel: 'script', platform: 'ANDROID' }),
  });
  const j: any = await r.json().catch(() => ({}));
  const token = j?.data?.accessToken as string | undefined;
  if (!token) throw new Error(`cannot log in as ${code} (${r.status}): ${j?.message ?? 'no answer'}`);
  tokens.set(code, token);
  return token;
}

async function call(who: Who, method: string, path: string, body?: unknown): Promise<Reply> {
  const token = await login(PEOPLE[who]);
  const r = await fetch(`${API}${path}`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'X-Client': 'mobile' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const raw: any = await r.json().catch(() => null);
  return { status: r.status, data: raw?.data, message: raw?.message ?? '', raw };
}

/** A fixed UUID for a key, so running the script again sends the same client id (the server answers "already" instead of making a second record). */
const uid = (key: string): string => {
  const h = createHash('sha1').update(`team-demo:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
/** The signed-in person's id, read from their token. */
const idOf = async (who: Who): Promise<string> => JSON.parse(Buffer.from((await login(PEOPLE[who])).split('.')[1]!, 'base64url').toString()).sub as string;
/** The next Monday to Friday on or after `iso`, so a leave never lands on a weekly off. */
const weekday = (iso: string): string => {
  let d = iso;
  while ([0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay())) d = day(d, 1);
  return d;
};

const problems: string[] = [];
const done: string[] = [];
let apply = false;

/** One thing to do. In a dry run it is only listed. A throw, or a non-2xx answer the step does not accept, is kept for the end. */
async function step(name: string, fn: () => Promise<void>): Promise<void> {
  if (!apply) {
    console.log(`  would: ${name}`);
    return;
  }
  try {
    await fn();
    done.push(name);
    console.log(`  ok:    ${name}`);
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    problems.push(`${name}: ${text}`);
    console.log(`  FAIL:  ${name}\n         ${text}`);
  }
}

const must = (r: Reply, what: string, also: number[] = []) => {
  if (r.status >= 200 && r.status < 300) return r;
  if (also.includes(r.status)) return r;
  throw new Error(`${what} -> ${r.status} ${r.message}${r.raw?.data ? ` ${JSON.stringify(r.raw.data).slice(0, 200)}` : ''}`);
};

/** Sync records, the way the phone sends them. Answers are per record; a refused one is thrown. */
async function push(who: Who, kind: string, payload: unknown, clientId: string): Promise<any> {
  const r = must(await call(who, 'POST', '/sync/push', { records: [{ clientId: uid(clientId), kind, dependsOn: [], clientCreatedAt: new Date().toISOString(), payload }] }), `push ${kind}`);
  const result = r.data?.results?.[0];
  if (result && result.status && !['OK', 'ALREADY_SYNCED', 'DUPLICATE', 'SYNCED'].includes(String(result.status))) {
    throw new Error(`${kind} ${result.status}: ${result.message ?? result.error?.message ?? JSON.stringify(result).slice(0, 220)}`);
  }
  return result;
}

interface Snapshot {
  doctors: { id: string; name: string; routeId: string; location: { latitude: number; longitude: number } | null }[];
  chemists: { id: string; name: string; routeId: string; location: { latitude: number; longitude: number } | null }[];
  distributors: { id: string; name: string }[];
  products: { id: string; name: string; ptrPaise?: number | null; ptsPaise?: number | null }[];
}
const snaps = new Map<Who, Snapshot>();
async function snapshot(who: Who): Promise<Snapshot> {
  const hit = snaps.get(who);
  if (hit) return hit;
  const r = must(await call(who, 'GET', '/sync/pull'), `pull as ${who}`);
  const md = r.data?.sources?.fieldMasterData?.data ?? r.data?.fieldMasterData?.data ?? r.data?.fieldMasterData;
  if (!md) throw new Error(`pull as ${who}: no fieldMasterData in ${Object.keys(r.data ?? {}).join(',')}`);
  snaps.set(who, md as Snapshot);
  return md as Snapshot;
}

const day = (iso: string, plus: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + plus * 86_400_000).toISOString().slice(0, 10);
async function businessToday(): Promise<string> {
  const r = must(await call('r1', 'GET', '/sync/pull'), 'pull for today');
  const p = r.data?.sources?.planning?.data ?? r.data?.planning?.data;
  return (p?.today as string) ?? new Date().toISOString().slice(0, 10);
}

async function tourPlan(who: Who, month: string, routeIds: string[], submit: boolean): Promise<string> {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const skip = new Set<string>();
  for (let tries = 0; tries < 40; tries++) {
    const entries = [];
    for (let d = 1; d <= last; d++) {
      const ds = `${month}-${String(d).padStart(2, '0')}`;
      if (new Date(`${ds}T00:00:00Z`).getUTCDay() === 0 || skip.has(ds)) continue;
      entries.push({ planDate: ds, returnDate: null, workingType: 'FIELD_WORK', dayKind: 'NORMAL', workWith: [], routeIds: [routeIds[d % routeIds.length]!], remarks: null });
    }
    const r = await call(who, 'POST', '/planning/monthly', { planMonth: month, entries });
    const off = r.raw?.data;
    if (r.status === 400 && off?.date && ['WEEKLY_OFF', 'HOLIDAY'].includes(off.reason)) {
      skip.add(off.date);
      continue;
    }
    must(r, `save ${month} plan`, [409]);
    const id = (r.data?.id as string | undefined) ?? (await call(who, 'GET', `/planning/monthly?from=${month}&to=${month}`)).data?.[0]?.id;
    if (submit) must(await call(who, 'POST', `/planning/monthly/${id}/submit`), `submit ${month} plan`, [409]);
    return id as string;
  }
  throw new Error(`could not place the ${month} plan around the days off`);
}

const hasPlan = async (who: Who, month: string) => ((await call(who, 'GET', `/planning/monthly?from=${month}&to=${month}`)).data ?? []).length > 0;

/** Every request waiting for `who`, as the inbox lists them. */
async function inbox(who: Who): Promise<any[]> {
  const out: any[] = [];
  for (let page = 1; page <= 10; page++) {
    const r = must(await call(who, 'GET', `/approvals/inbox?pageSize=50&page=${page}`), 'inbox');
    out.push(...(r.data?.items ?? []));
    if (page >= (r.data?.totalPages ?? 1)) break;
  }
  return out;
}
async function decide(who: Who, decision: 'APPROVE' | 'REJECT', pick: (i: any) => boolean, comment?: string): Promise<number> {
  const items = (await inbox(who)).filter((i) => i.status === 'SUBMITTED' && i.canAct && pick(i));
  if (items.length === 0) return 0;
  const r = must(await call(who, 'POST', '/approvals/bulk', { decision, requests: items.map((i) => ({ id: i.id, cycle: i.cycle })), ...(comment ? { comment } : {}) }), `${decision} ${items.length}`);
  const failed = (r.data?.results ?? []).filter((x: any) => !x.ok);
  if (failed.length) throw new Error(`${failed.length} refused: ${failed[0].message}`);
  return items.length;
}
const by = (code: string, kind?: string) => (i: any) => i.submitter?.employeeCode === code && (!kind || i.kind === kind);

async function main(): Promise<void> {
  assertLocalDatabase(env.MONGO_URI);
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(API)) throw new Error(`Refusing to run: the API (${API}) is not local.`);
  apply = process.argv.includes('--apply');
  console.log(apply ? 'Doing it against' : 'Dry run against', API);

  const today = apply ? await businessToday() : '(today)';
  const tomorrow = apply ? day(today, 1) : '(tomorrow)';
  console.log(`today is ${today}\n`);

  // ── Tour Plans (monthly): December ───────────────────────────────────────────────────────────────────────────────────────────────
  console.log('Tour Plans');
  await step('Tour Plan Dec: DEMOMRR1 sent (waits for the RSM)', async () => {
    if (await hasPlan('r1', '2026-12')) return;
    const my = must(await call('r1', 'GET', '/territory/my-routes'), 'routes').data as { id: string }[];
    await tourPlan('r1', '2026-12', my.map((r) => r.id), true);
  });
  await step('Tour Plan Dec: DEMOMRR2 sent, then approved by the RSM', async () => {
    if (!(await hasPlan('r2', '2026-12'))) {
      const my = must(await call('r2', 'GET', '/territory/my-routes'), 'routes').data as { id: string }[];
      await tourPlan('r2', '2026-12', my.map((r) => r.id), true);
    }
    await decide('rsm', 'APPROVE', by('DEMOMRR2', 'MONTHLY_PLAN'));
  });
  await step('Tour Plan Dec: DEMOASM (a manager: routes of the team) sent to the RSM', async () => {
    if (await hasPlan('asm', '2026-12')) return;
    const routes = must(await call('asm', 'GET', '/planning/team-routes?pageSize=20'), 'team routes').data.items as { id: string }[];
    await tourPlan('asm', '2026-12', routes.map((r) => r.id), true);
  });
  await step('Tour Plan Dec: DEMOASM2 saved but not sent (a draft)', async () => {
    if (await hasPlan('asm2', '2026-12')) return;
    const routes = must(await call('asm2', 'GET', '/planning/team-routes?pageSize=20'), 'team routes').data.items as { id: string }[];
    await tourPlan('asm2', '2026-12', routes.map((r) => r.id), false);
  });
  await step('Tour Plan Dec: DEMOMRA1 sent (waits for the ASM)', async () => {
    if (await hasPlan('a1', '2026-12')) return;
    const my = must(await call('a1', 'GET', '/territory/my-routes'), 'routes').data as { id: string }[];
    await tourPlan('a1', '2026-12', my.map((r) => r.id), true);
  });
  await step('Tour Plan Dec: DEMOMRA2 sent, then rejected by the ASM with a reason', async () => {
    if (!(await hasPlan('a2', '2026-12'))) {
      const my = must(await call('a2', 'GET', '/territory/my-routes'), 'routes').data as { id: string }[];
      await tourPlan('a2', '2026-12', my.map((r) => r.id), true);
    }
    await decide('asm', 'REJECT', by('DEMOMRA2', 'MONTHLY_PLAN'), 'Please plan the out-station days on the Kolkata route.');
  });

  // ── Daily Plans ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nDaily Plans');
  const sendDaily = async (who: Who, date: string) => {
    const plans = (must(await call(who, 'GET', `/planning/daily?from=${date}&to=${date}`), 'daily plans').data ?? []) as any[];
    const plan = plans[0];
    if (!plan) throw new Error(`no daily plan on ${date}`);
    if (plan.status !== 'DRAFT' && plan.status !== 'REOPENED' && plan.status !== 'REJECTED') return;
    const mine = (await snapshot(who)).doctors.filter((d) => plan.routeIds.includes(d.routeId)).slice(0, 4);
    if (mine.length > 0) must(await call(who, 'POST', '/planning/daily/doctors', { planDate: date, doctorIds: mine.map((d) => d.id) }), 'doctors', [400]);
    must(await call(who, 'POST', `/planning/daily/${plan.id}/submit`), `submit daily ${date}`, [409]);
  };
  // Today's deadline (10:00) has usually passed when this runs, so Admin lets these people send late, the way an Admin would.
  await step('Daily Plan today: Admin allows a late send for the people below', async () => {
    for (const who of ['r1', 'r2', 'a1', 'a2', 'a3', 'asm2'] as Who[]) {
      const r = await call('admin', 'POST', '/planning/late-grants', { userId: await idOf(who), kind: 'DAILY_PLAN', planKey: today, reason: 'Team demo: today’s plan sent after the deadline' });
      must(r, `late send for ${PEOPLE[who]}`, [409]);
    }
  });
  for (const who of ['r1', 'r2', 'a1', 'a2', 'a3'] as Who[]) await step(`Daily Plan today: ${PEOPLE[who]} sent`, () => sendDaily(who, today));
  await step('Daily Plan today: the RSM approves MRR2, the ASM approves MRA1 and MRA3', async () => {
    await decide('rsm', 'APPROVE', (i) => i.kind === 'DAILY_PLAN' && ['DEMOMRR2', 'DEMOMRR1'].includes(i.submitter?.employeeCode));
    await decide('asm', 'APPROVE', (i) => i.kind === 'DAILY_PLAN' && ['DEMOMRA1', 'DEMOMRA3'].includes(i.submitter?.employeeCode));
  });
  for (const who of ['r1', 'r2', 'a1'] as Who[]) await step(`Daily Plan tomorrow: ${PEOPLE[who]} sent`, () => sendDaily(who, tomorrow));
  await step('Daily Plan today: DEMOASM2 (a manager) sent to the RSM', () => sendDaily('asm2', today));

  // ── Calls and the daily report ─────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nCalls and daily reports (today)');
  const calls = async (who: Who, doctors: number, chemists: number, followups: number, send: boolean) => {
    const snap = await snapshot(who);
    const at = (o: { location: { latitude: number; longitude: number } | null }) => (o.location ? { capturedLocation: o.location, accuracyMeters: 8 } : { capturedLocation: null, accuracyMeters: null });
    const plan = ((await call(who, 'GET', `/planning/daily?from=${today}&to=${today}`)).data ?? [])[0];
    const planned: string[] = (plan?.doctors ?? []).map((d: any) => d.doctorId);
    const pool = snap.doctors.filter((d) => planned.includes(d.id));
    const list = (pool.length ? pool : snap.doctors).slice(0, doctors);
    for (const d of list) await push(who, 'DOCTOR_CALL', { reportDate: today, doctorId: d.id, workWith: [], remarks: 'Detailing done, asked for samples', ...at(d), samples: [] }, `team-demo-${PEOPLE[who]}-dc-${d.id}-${today}`);
    for (const c of snap.chemists.slice(0, chemists)) await push(who, 'CHEMIST_CALL', { reportDate: today, chemistId: c.id, remarks: 'Stock checked', ...at(c) }, `team-demo-${PEOPLE[who]}-cc-${c.id}-${today}`);
    for (const d of snap.doctors.slice(doctors, doctors + followups)) await push(who, 'DOCTOR_FOLLOWUP', { reportDate: today, doctorId: d.id, remarks: 'Called back about the sample request', ...at(d) }, `team-demo-${PEOPLE[who]}-df-${d.id}-${today}`);
    if (send) await push(who, 'DCR_SUBMIT', { reportDate: today, remarks: 'Good day, two new prescriptions' }, `team-demo-${PEOPLE[who]}-dcr-${today}`);
  };
  await step('DEMOMRR1: 2 doctor calls, 1 chemist call, 1 follow-up, report sent', () => calls('r1', 2, 1, 1, true));
  await step('DEMOMRR2: 2 doctor calls, report not sent (working)', () => calls('r2', 2, 0, 0, false));
  await step('DEMOMRA1: 2 doctor calls, 2 chemist calls, report sent to the ASM', () => calls('a1', 2, 2, 0, true));

  // ── Leave ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nLeave');
  const leave = async (who: Who, start: string, end: string, reason: string) => {
    // Unpaid leave types are used: the demo MRs have no Pay Band, and paid leave needs one.
    const types = must(await call(who, 'GET', '/hr/leave-types'), 'leave types').data as { id: string; name: string; active: boolean; isPaid: boolean }[];
    const type = types.find((t) => t.active && !t.isPaid) ?? types.find((t) => t.active) ?? types[0];
    if (!type) throw new Error('no leave type is set up');
    start = weekday(start);
    end = weekday(end < start ? start : end);
    const mine = ((await call(who, 'GET', '/hr/leaves/me?pageSize=50')).data?.items ?? []) as any[];
    if (mine.some((l) => l.startDate === start)) return;
    must(await call(who, 'POST', '/hr/leaves', { leaveTypeId: type.id, startDate: start, endDate: end, reason }), `leave ${start}`);
  };
  await step('Leave: DEMOMRR1 (waits for the RSM)', () => leave('r1', day(today, 9), day(today, 10), 'Family function'));
  await step('Leave: DEMOASM (a manager, waits for the RSM)', () => leave('asm', day(today, 12), day(today, 12), 'Medical appointment'));
  await step('Leave: DEMOMRA1 (waits for the ASM)', () => leave('a1', day(today, 14), day(today, 15), 'Travel'));
  await step('Leave: DEMOMRR2, approved by the RSM', async () => {
    await leave('r2', day(today, 6), day(today, 6), 'Personal work');
    await decide('rsm', 'APPROVE', by('DEMOMRR2', 'LEAVE'));
  });
  await step('Leave: DEMOMRA2, rejected by the ASM', async () => {
    await leave('a2', day(today, 7), day(today, 8), 'Holiday');
    await decide('asm', 'REJECT', by('DEMOMRA2', 'LEAVE'), 'Two people are already away that week.');
  });

  // ── Doctor services ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nDoctor services');
  const service = async (who: Who, nth: number, type: string, amountPaise: number, key: string) => {
    const doctor = (await snapshot(who)).doctors[nth];
    if (!doctor) throw new Error('no doctor to request a service for');
    await push(who, 'DOCTOR_SERVICE', { doctorId: doctor.id, serviceType: type, amountPaise, remarks: 'Requested for the quarterly camp' }, `team-demo-${key}`);
  };
  await step('Service: DEMOMRR1, a tour package (waits for the RSM)', () => service('r1', 0, 'TOUR_PACKAGE', 4_500_000, 'svc-r1-tour'));
  await step('Service: DEMOMRR2, a gift, approved (then waits for Admin to mark it done)', async () => {
    await service('r2', 0, 'GIFT', 250_000, 'svc-r2-gift');
    await decide('rsm', 'APPROVE', by('DEMOMRR2', 'DOCTOR_SERVICE'));
  });
  await step('Service: DEMOMRR1, an online promotion, rejected', async () => {
    await service('r1', 1, 'ONLINE_PROMOTION', 900_000, 'svc-r1-online');
    await decide('rsm', 'REJECT', (i) => i.kind === 'DOCTOR_SERVICE' && i.subject?.title?.includes?.('promotion'), 'Not in this quarter’s budget.');
  });
  await step('Service: DEMOASM, for one of the team’s doctors (waits for the RSM)', async () => {
    const doctor = (await snapshot('a1')).doctors[1] ?? (await snapshot('a1')).doctors[0];
    if (!doctor) throw new Error('DEMOMRA1 has no doctor');
    await push('asm', 'DOCTOR_SERVICE', { doctorId: doctor.id, serviceType: 'OTHERS', amountPaise: 120_000, remarks: 'Clinic banner' }, 'team-demo-svc-asm-other');
  });

  // ── New doctors and chemists ─────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nNew doctors and chemists');
  const newDoctor = async (who: Who, name: string, key: string) => {
    const snap = await snapshot(who);
    const base = snap.doctors[0];
    if (!base) throw new Error('no doctor to copy a route and a location from');
    await push(who, 'NEW_DOCTOR', { routeId: base.routeId, name, address: 'Hill Cart Road, Siliguri', specialty: 'General Physician', qualification: 'MBBS', email: null, phone: '9000011111', visitFrequency: 2, location: base.location ?? { latitude: 26.7271, longitude: 88.3953 } }, `team-demo-${key}`);
  };
  const newChemist = async (who: Who, name: string, key: string) => {
    const base = (await snapshot(who)).chemists[0];
    if (!base) throw new Error('no chemist to copy a route and a location from');
    await push(who, 'NEW_CHEMIST', { routeId: base.routeId, name, address: 'Sevoke Road, Siliguri', phone: '9000022222', location: base.location ?? { latitude: 26.7271, longitude: 88.3953 } }, `team-demo-${key}`);
  };
  await step('New doctor: DEMOMRR1 (waits for the RSM)', () => newDoctor('r1', 'TEAMDEMO Dr. Rao', 'nd-r1'));
  await step('New doctor: DEMOMRR2, approved by the RSM', async () => {
    await newDoctor('r2', 'TEAMDEMO Dr. Sen', 'nd-r2');
    await decide('rsm', 'APPROVE', (i) => i.kind === 'NEW_DOCTOR' && i.submitter?.employeeCode === 'DEMOMRR2');
  });
  await step('New doctor: DEMOMRA2, rejected by the ASM', async () => {
    await newDoctor('a2', 'TEAMDEMO Dr. Das', 'nd-a2');
    await decide('asm', 'REJECT', (i) => i.kind === 'NEW_DOCTOR' && i.submitter?.employeeCode === 'DEMOMRA2', 'Already on the list under another spelling.');
  });
  await step('New chemist: DEMOMRR1 (waits for the RSM)', () => newChemist('r1', 'TEAMDEMO Chemist Nandi', 'nc-r1'));
  await step('New chemist: DEMOMRA1 (waits for the ASM)', () => newChemist('a1', 'TEAMDEMO Chemist Paul', 'nc-a1'));

  // ── Orders ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nOrders');
  const order = async (who: Who, outletType: 'CHEMIST' | 'DISTRIBUTOR', key: string) => {
    const snap = await snapshot(who);
    const outlet = outletType === 'CHEMIST' ? snap.chemists[0] : snap.distributors[0];
    const products = snap.products.slice(0, 2);
    if (!outlet || products.length === 0) throw new Error(`nothing to order ${outletType === 'CHEMIST' ? 'for' : 'from'}`);
    await push(who, 'ORDER', { outletType, outletId: outlet.id, orderDate: today, remarks: null, lines: products.map((p) => ({ productId: p.id, quantity: 20, unitPricePaise: (outletType === 'DISTRIBUTOR' ? p.ptsPaise : p.ptrPaise) ?? 1000 })) }, `team-demo-${key}`);
  };
  await step('Orders: DEMOMRR1 a chemist order and a distributor order', async () => {
    await order('r1', 'CHEMIST', 'ord-r1-c');
    await order('r1', 'DISTRIBUTOR', 'ord-r1-d');
  });
  await step('Orders: DEMOMRA1 a distributor order, DEMOMRR2 a chemist order', async () => {
    await order('a1', 'DISTRIBUTOR', 'ord-a1-d');
    await order('r2', 'CHEMIST', 'ord-r2-c');
  });

  // ── Gifts ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nGifts');
  await step('Gifts: Admin sets two aside for DEMOMRR1’s doctors, one is marked done', async () => {
    const doctors = (await snapshot('r1')).doctors;
    const have = ((await call('r1', 'GET', '/field-activity/doctor-gifts')).data ?? []) as any[];
    if (have.length >= 2) return;
    const g1 = must(await call('admin', 'POST', '/field-activity/admin/doctor-gifts', { doctorId: doctors[0]!.id, productName: 'Table lamp', amountPaise: 80_000 }), 'gift 1');
    must(await call('admin', 'POST', '/field-activity/admin/doctor-gifts', { doctorId: doctors[1]!.id, productName: 'Desk calendar', amountPaise: 30_000 }), 'gift 2');
    const id = g1.data?.id as string | undefined;
    if (id) await push('r1', 'GIFT_DONE', { giftId: id }, 'team-demo-gift-r1-1');
  });

  // ── Secondary sales ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\nSecondary sales (this month)');
  const month = today.slice(0, 7);
  const secondary = async (who: Who, send: boolean) => {
    const read = must(await call(who, 'GET', `/sales/secondary-stock?userId=${await idOf(who)}&month=${month}`), 'read secondary');
    const rows: any[] = read.data?.distributors?.flatMap((d: any) => (d.products ?? d.lines ?? []).map((p: any) => ({ distributorId: d.distributor?.id ?? d.distributorId, ...p }))) ?? read.data?.lines ?? [];
    const lines = rows.slice(0, 4).map((l: any, i: number) => ({ distributorId: l.distributorId, productId: l.productId ?? l.product?.id, openingQty: 10, primaryQty: 30 + i, issuedQty: 25 + i }));
    if (lines.length === 0) throw new Error('the secondary screen lists no distributor × product for this MR');
    must(await call(who, 'POST', '/sales/secondary-stock', { month, lines }), 'save secondary', [409]);
    if (!send) return;
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const form = new FormData();
    form.set('file', new Blob([png], { type: 'image/png' }), 'statement.png');
    form.set('month', month);
    const up = await fetch(`${API}/sales/employee-secondary/attachments`, { method: 'POST', headers: { authorization: `Bearer ${await login(PEOPLE[who])}`, 'X-Client': 'mobile' }, body: form });
    if (up.status === 500) throw new Error('the proof file cannot be stored: Cloudinary is not set up locally (add CLOUDINARY_* to apps/api/.env.local and run this again). Until then the secondary figures stay saved as drafts and nothing is sent for approval.');
    if (!up.ok) throw new Error(`proof upload -> ${up.status} ${(await up.json().catch(() => ({})) as any).message ?? ''}`);
    must(await call(who, 'POST', '/sales/secondary-stock/submit', { month }), 'submit secondary', [409]);
  };
  await step('Secondary: DEMOMRR1 and DEMOMRR2 sent with a proof file (wait for the RSM)', async () => {
    await secondary('r1', true);
    await secondary('r2', true);
  });
  await step('Secondary: DEMOMRA1 and DEMOMRA2 sent (wait for the ASM); DEMOMRA3 approved', async () => {
    await secondary('a1', true);
    await secondary('a2', true);
    await secondary('a3', true);
    await decide('asm', 'APPROVE', (i) => i.kind === 'SECONDARY_SALES' && i.submitter?.employeeCode === 'DEMOMRA3');
  });
  await step('Secondary: DEMOMRR2 approved by the RSM, so Targets has a figure', async () => {
    await decide('rsm', 'APPROVE', (i) => i.kind === 'SECONDARY_SALES' && i.submitter?.employeeCode === 'DEMOMRR2');
  });

  console.log(`\n${apply ? `Done: ${done.length} steps ok, ${problems.length} refused.` : 'Dry run: nothing was done. Add --apply to do it.'}`);
  if (problems.length > 0) {
    console.log('\nWhat the API refused (each is a bug, a missing setup, or a rule the script did not know):');
    for (const p of problems) console.log(` - ${p}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
