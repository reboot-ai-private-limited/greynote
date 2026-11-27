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
