import { describe, expect, it } from 'vitest';
import { assertLocalDatabase, downlineOf, HQS, PEOPLE, plannableRoutes, ROUTES, tourPlanRoutes, workDays } from './localTestData.js';

describe('the local test world', () => {
  it('managers hold no route; the routes belong to MRs', () => {
    for (const p of PEOPLE.filter((x) => x.designation !== 'MR')) expect(p.routes).toEqual([]);
    for (const p of PEOPLE.filter((x) => x.designation === 'MR')) expect(p.routes.length).toBeGreaterThan(0);
  });

  it('shows every case: a shared route, an MR on two routes, a route nobody holds, one out-station route, an MR direct to the RSM', () => {
    const holders = (r: string) => PEOPLE.filter((p) => p.routes.includes(r)).map((p) => p.code);
    expect(holders('N1')).toHaveLength(2);
    expect(PEOPLE.some((p) => p.routes.length === 2 && !p.routes.includes('OUT'))).toBe(true);
    expect(holders('S3')).toEqual([]);
    expect(ROUTES.filter((r) => r.type === 'OUT_STATION')).toHaveLength(1);
    expect(PEOPLE.find((p) => p.code === 'DEMOMRR1')?.manager).toBe('DEMORSM');
    for (const r of ROUTES) expect(Object.keys(HQS)).toContain(r.hq);
  });

  it('every person is below the ZSM exactly once, and every manager exists', () => {
    expect(downlineOf('DEMOZSM').map((p) => p.code).sort()).toEqual(PEOPLE.filter((p) => p.code !== 'DEMOZSM').map((p) => p.code).sort());
    for (const p of PEOPLE) if (p.manager) expect(PEOPLE.some((m) => m.code === p.manager)).toBe(true);
  });

  it('a manager plans the routes of the MRs below them, and nobody else’s', () => {
    expect(plannableRoutes('DEMOASM')).toEqual(['N1', 'N2', 'N3', 'OUT']);
    expect(plannableRoutes('DEMOASM2')).toEqual(['S1', 'S2']);
    expect(plannableRoutes('DEMORSM')).toEqual(['N1', 'N2', 'N3', 'S1', 'S2', 'W1', 'W2', 'OUT']);
    expect(plannableRoutes('DEMOZSM')).toEqual(plannableRoutes('DEMORSM'));
    expect(plannableRoutes('DEMOMRA3')).toEqual(['N3']);
  });

  it('the Tour Plan rotates plain routes over the working days; Sundays are off; S3 and OUT are never planned', () => {
    const days = workDays('2026-11-17');
    expect(days[0]).toBe('2026-11-17');
    expect(days).not.toContain('2026-11-22');
    expect(days).not.toContain('2026-11-29');
    expect(days.at(-1)).toBe('2026-11-30');
    const plan = tourPlanRoutes('DEMOASM', days);
    expect(new Set(plan.map((p) => p.routeId))).toEqual(new Set(['N1', 'N2', 'N3']));
    expect(tourPlanRoutes('DEMORSM', days).map((p) => p.routeId)).not.toContain('S3');
  });

  it('refuses a database that is not on this machine', () => {
    expect(() => assertLocalDatabase('mongodb://127.0.0.1:27018/greynotenew')).not.toThrow();
    expect(() => assertLocalDatabase('mongodb://localhost:27017/x')).not.toThrow();
    expect(() => assertLocalDatabase('mongodb+srv://u:p@cluster0.mongodb.net/greynotenew')).toThrow(/not a local database/);
    expect(() => assertLocalDatabase('mongodb://u:p@db.example.com:27017/x')).toThrow(/not a local database/);
  });
});
