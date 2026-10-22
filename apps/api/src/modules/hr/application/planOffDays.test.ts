import { describe, expect, it } from 'vitest';
import { PlanOffDays } from './planOffDays.js';
import { CreateHolidayUseCase } from './usecases/createHoliday.usecase.js';
import { FakeHolidays, FakeTerritory } from './usecases/hrTestKit.js';

describe('PlanOffDays', () => {
  const setup = async () => {
    const holidays = new FakeHolidays();
    const territory = new FakeTerritory();
    territory.userHq.set('mr', { hqId: 'hq-slg', zoneId: 'zone-wb' });
    // A ZSM based in Jalpaiguri who also covers Siliguri and Assam.
    territory.userHq.set('zsm', { hqId: 'hq-jpg', zoneId: 'zone-wb' });
    territory.coverage.set('zsm', { hqIds: ['hq-slg'], zoneIds: ['zone-as'] });
    const create = new CreateHolidayUseCase(holidays, territory);
    const none = { zoneIds: [] as string[], hqIds: [] as string[] };
    await create.execute({ ...none, name: 'Gandhi Jayanti', date: '2026-10-02', scope: 'NATIONAL' }, 'hr');
    await create.execute({ ...none, name: 'Siliguri Day', date: '2026-10-06', scope: 'HQ', hqIds: ['hq-slg'] }, 'hr');
    await create.execute({ ...none, name: 'Bihu', date: '2026-10-07', scope: 'ZONE', zoneIds: ['zone-as'] }, 'hr');
    await create.execute({ ...none, name: 'Durga Puja', date: '2026-10-18', endDate: '2026-10-19', scope: 'ZONE', zoneIds: ['zone-wb'] }, 'hr');
    await create.execute({ ...none, name: 'Bhai Dooj', date: '2026-10-19', scope: 'NATIONAL' }, 'hr');
    return new PlanOffDays(holidays, territory, async () => 'SUNDAY');
  };

  it('locks the weekly off and the holidays of the main HQ, its Zone and National ones', async () => {
    const off = await (await setup()).list('mr', '2026-10-01', '2026-10-19');
    expect(off).toEqual([
      { date: '2026-10-02', reason: 'HOLIDAY', name: 'Gandhi Jayanti' },
      { date: '2026-10-04', reason: 'WEEKLY_OFF', name: null },
      { date: '2026-10-06', reason: 'HOLIDAY', name: 'Siliguri Day' },
      { date: '2026-10-11', reason: 'WEEKLY_OFF', name: null },
      // A Sunday that is also a holiday reads as the holiday; two holidays on a day are both named.
      { date: '2026-10-18', reason: 'HOLIDAY', name: 'Durga Puja' },
      { date: '2026-10-19', reason: 'HOLIDAY', name: 'Durga Puja / Bhai Dooj' },
    ]);
  });

  it('ignores holidays of the other HQs and Zones a manager only covers', async () => {
    const dates = (await (await setup()).list('zsm', '2026-10-01', '2026-10-10')).map((d) => d.date);
    expect(dates).toEqual(['2026-10-02', '2026-10-04']); // not Siliguri Day (6th), not Bihu (7th)
  });

  it('with no main HQ, locks only National holidays and the weekly off', async () => {
    const off = await (await setup()).list('nobody', '2026-10-01', '2026-10-07');
    expect(off.map((d) => d.date)).toEqual(['2026-10-02', '2026-10-04']);
  });
});
