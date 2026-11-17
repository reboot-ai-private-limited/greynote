/**
 * The local test world: a small company shaped to show every rule of "managers see what their team holds" and route-first planning
 * (decision-log 2026-11-16 and 2026-11-17). Pure data and helpers; `seed-local-test.ts` writes it. Local database only.
 *
 *   DEMOZSM ── DEMORSM ─┬─ DEMOASM  ─┬─ DEMOMRA1  (N1, OUT)
 *                       │            ├─ DEMOMRA2  (N1, N2)        N1 is held by two MRs
 *                       │            └─ DEMOMRA3  (N3)
 *                       ├─ DEMOASM2 ─┬─ DEMOMRB1  (S1)
 *                       │            └─ DEMOMRB2  (S2)           S3 is held by nobody
 *                       ├─ DEMOMRR1  (W1)            direct to the RSM
 *                       └─ DEMOMRR2  (W1, W2)        W1 is held by two MRs
 * Managers hold no route: a manager's routes are the routes of the MRs below them, computed, never copied.
 */
export const LOCAL_TEST_PASSWORD = 'admin123';
export const TEST_ZONE = 'TEST East';
export const TEST_MONTH = '2026-11';

export const HQS = { N: 'TEST HQ North', S: 'TEST HQ South', W: 'TEST HQ West' } as const;
export type HqKey = keyof typeof HQS;

export interface TestRoute {
  key: string;
  hq: HqKey;
  destination: string;
  type?: 'OUT_STATION';
  distanceKm?: string;
}
export const ROUTES: TestRoute[] = [
  { key: 'N1', hq: 'N', destination: 'Alpha' },
  { key: 'N2', hq: 'N', destination: 'Bravo' },
  { key: 'N3', hq: 'N', destination: 'Charlie' },
  { key: 'S1', hq: 'S', destination: 'Delta' },
  { key: 'S2', hq: 'S', destination: 'Echo' },
  { key: 'S3', hq: 'S', destination: 'Foxtrot' }, // nobody holds it
  { key: 'W1', hq: 'W', destination: 'Golf' },
  { key: 'W2', hq: 'W', destination: 'Hotel' },
  { key: 'OUT', hq: 'N', destination: 'Kolkata', type: 'OUT_STATION', distanceKm: '560' },
];
export const routeName = (r: TestRoute) => `${HQS[r.hq]} to ${r.destination}`;

export type Designation = 'ZSM' | 'RSM' | 'ASM' | 'MR';
export interface TestPerson {
  code: string;
  name: string;
  designation: Designation;
  manager: string | null;
  /** HQs covered; the first is the main HQ. Empty for the ZSM, who covers the whole Zone. */
  hqs: HqKey[];
  /** Routes held: MRs only. */
  routes: string[];
  /** Exists already in the copied data (the seed only moves it into this tree). */
  existing: boolean;
}

export const PEOPLE: TestPerson[] = [
  { code: 'DEMOZSM', name: 'Demo ZSM', designation: 'ZSM', manager: null, hqs: [], routes: [], existing: true },
  { code: 'DEMORSM', name: 'Demo RSM', designation: 'RSM', manager: 'DEMOZSM', hqs: ['N', 'S', 'W'], routes: [], existing: true },
  { code: 'DEMOASM', name: 'Demo ASM (North)', designation: 'ASM', manager: 'DEMORSM', hqs: ['N'], routes: [], existing: true },
  { code: 'DEMOASM2', name: 'Demo ASM 2 (South)', designation: 'ASM', manager: 'DEMORSM', hqs: ['S'], routes: [], existing: false },
  { code: 'DEMOMRA1', name: 'Demo MR A1', designation: 'MR', manager: 'DEMOASM', hqs: ['N'], routes: ['N1', 'OUT'], existing: true },
  { code: 'DEMOMRA2', name: 'Demo MR A2', designation: 'MR', manager: 'DEMOASM', hqs: ['N'], routes: ['N1', 'N2'], existing: true },
  { code: 'DEMOMRA3', name: 'Demo MR A3', designation: 'MR', manager: 'DEMOASM', hqs: ['N'], routes: ['N3'], existing: false },
  { code: 'DEMOMRB1', name: 'Demo MR B1', designation: 'MR', manager: 'DEMOASM2', hqs: ['S'], routes: ['S1'], existing: false },
  { code: 'DEMOMRB2', name: 'Demo MR B2', designation: 'MR', manager: 'DEMOASM2', hqs: ['S'], routes: ['S2'], existing: false },
  { code: 'DEMOMRR1', name: 'Demo MR R1 (direct to RSM)', designation: 'MR', manager: 'DEMORSM', hqs: ['W'], routes: ['W1'], existing: true },
  { code: 'DEMOMRR2', name: 'Demo MR R2 (direct to RSM)', designation: 'MR', manager: 'DEMORSM', hqs: ['W'], routes: ['W1', 'W2'], existing: true },
];

/** Everyone at any depth below `code`. */
export function downlineOf(code: string, people: readonly TestPerson[] = PEOPLE): TestPerson[] {
  const out: TestPerson[] = [];
  const queue = [code];
  while (queue.length > 0) {
    const manager = queue.shift();
    for (const p of people.filter((x) => x.manager === manager)) {
      out.push(p);
      queue.push(p.code);
    }
  }
  return out;
}

/** The routes a person may plan: an MR's own; a manager's are those held by anyone below them. Plain (not out-station) routes first. */
export function plannableRoutes(code: string, people: readonly TestPerson[] = PEOPLE): string[] {
  const me = people.find((p) => p.code === code)!;
  const held = me.designation === 'MR' ? me.routes : [...new Set(downlineOf(code, people).flatMap((p) => p.routes))];
  return [...held].sort((a, b) => Number(a === 'OUT') - Number(b === 'OUT') || a.localeCompare(b));
}

/** Working days of the Tour Plan's month from `from` on: Sundays are the weekly off. */
export function workDays(from: string, month: string = TEST_MONTH): string[] {
  const days: string[] = [];
  for (let d = 1; d <= 31; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    const t = new Date(`${date}T00:00:00Z`);
    if (t.getUTCMonth() !== Number(month.slice(5)) - 1) break;
    if (date >= from && t.getUTCDay() !== 0) days.push(date);
  }
  return days;
}

/** One route per working day, rotating through what the person may plan (never the out-station route on a plain day). */
export function tourPlanRoutes(code: string, days: readonly string[], people: readonly TestPerson[] = PEOPLE): Array<{ date: string; routeId: string }> {
  const routes = plannableRoutes(code, people).filter((r) => r !== 'OUT');
  if (routes.length === 0) return [];
  return days.map((date, i) => ({ date, routeId: routes[i % routes.length]! }));
}

/** Refuses to run unless the database is on this machine: the seed sets one password for every account. */
export function assertLocalDatabase(mongoUri: string): void {
  const host = /^mongodb:\/\/(?:[^@/]*@)?([^/:?,]+)/.exec(mongoUri)?.[1];
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(`Refusing to run: MONGO_URI is not a local database (${host ?? 'not a mongodb:// address'}). Use DOTENV_CONFIG_PATH=.env.local.`);
  }
}
