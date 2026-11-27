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

describe('a manager calls only the doctors on that day’s team plans (2026-11-27)', () => {
  const levels = new Map([['asm', 2]]);
  const users = { getDesignationLevels: async (ids: string[]) => ids.map((userId) => ({ userId, level: levels.get(userId) ?? 1 })) };
  const withUsers = new CallChecks({} as never, {} as never, users as never, {} as never);
  const planned: DayContext = { workingType: 'FIELD_WORK', routeIds: [], doctorIds: ['d1'], toPlaceId: 'nax' };

  it('accepts a planned doctor, and any doctor for an MR', async () => {
    await expect(withUsers.managerCallOnPlan('asm', planned, 'd1')).resolves.toBeUndefined();
    await expect(withUsers.managerCallOnPlan('mr1', planned, 'd9')).resolves.toBeUndefined();
  });
  it('refuses a manager’s call on a doctor nobody they work with planned', async () => {
    await expect(withUsers.managerCallOnPlan('asm', planned, 'd9')).rejects.toMatchObject({ code: 'DOCTOR_NOT_ON_TEAM_PLAN' });
  });
});
