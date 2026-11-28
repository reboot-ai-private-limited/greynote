import { describe, expect, it } from 'vitest';
import { CallChecks, type DayContext } from './callChecks.js';

const checks = new CallChecks({} as never, {} as never, {} as never, {} as never);
const day = (toPlaceId: string | null): DayContext => ({ workingType: 'FIELD_WORK', routeIds: [], doctorIds: [], toPlaceId });

describe('a chemist is called at the day’s place (2026-11-27)', () => {
  it('accepts a chemist at the To place, and any chemist on an older day without places', () => {
    expect(() => checks.chemistAtPlace(day('nax'), { placeId: 'nax' })).not.toThrow();
    expect(() => checks.chemistAtPlace(day(null), { placeId: 'nax' })).not.toThrow();
  });
  it('refuses one elsewhere, pointing to a follow-up', () => {
    expect(() => checks.chemistAtPlace(day('nax'), { placeId: 'slg' })).toThrow(expect.objectContaining({ code: 'CHEMIST_NOT_AT_PLACE', message: expect.stringContaining('follow-up') }));
  });
});

describe('a manager calls any doctor of their team’s MRs (2026-11-28)', () => {
  const holder: Record<string, string> = { d1: 'mr1', d9: 'mr2', x1: 'stranger' };
  const master = {
    getDoctor: async (id: string) => ({ id, status: 'active' }),
    isAssignedToDoctor: async (userId: string, id: string) => holder[id] === userId,
    getAssignedUserId: async (id: string) => holder[id] ?? null,
  };
  const chain: Record<string, string[]> = { mr1: ['asm', 'rsm'], mr2: ['asm2', 'rsm'], stranger: ['other'] };
  const users = { getManagerChain: async (id: string) => (chain[id] ?? []).map((m) => ({ id: m })) };
  const checks = new CallChecks(master as never, {} as never, users as never, {} as never);

  it('accepts any doctor held below the manager, planned or not, at any level', async () => {
    await expect(checks.doctor('asm', 'd1')).resolves.toMatchObject({ id: 'd1' });
    await expect(checks.doctor('rsm', 'd1')).resolves.toMatchObject({ id: 'd1' });
    await expect(checks.doctor('rsm', 'd9')).resolves.toMatchObject({ id: 'd9' });
  });
  it('refuses a doctor outside their team', async () => {
    await expect(checks.doctor('asm', 'd9')).rejects.toMatchObject({ code: 'DOCTOR_NOT_ASSIGNED' });
    await expect(checks.doctor('rsm', 'x1')).rejects.toMatchObject({ code: 'DOCTOR_NOT_ASSIGNED' });
  });
});
