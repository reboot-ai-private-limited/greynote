import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import { CreateHolidayUseCase } from './createHoliday.usecase.js';
import { FakeHolidays, FakeTerritory } from './hrTestKit.js';
import type { HolidayScope } from '../../domain/holiday.entity.js';
import { ImportHolidaysUseCase, type HolidayImportRow } from './importHolidays.usecase.js';

describe('ImportHolidaysUseCase', () => {
  let holidays: FakeHolidays;
  let useCase: ImportHolidaysUseCase;
  beforeEach(() => {
    holidays = new FakeHolidays();
    const territory = new FakeTerritory();
    useCase = new ImportHolidaysUseCase(holidays, territory, new CreateHolidayUseCase(holidays, territory));
  });
  const read = (csv: string): HolidayImportRow[] =>
    csv.trim().split('\n').map((line, i) => {
      const [name = '', date = '', scope = '', zones = '', hqs = ''] = line.split(',');
      return {
        line: i + 2,
        name,
        date,
        scope: scope as HolidayScope,
        zones: zones.split(';').filter(Boolean),
        hqs: hqs.split(';').filter(Boolean).map((p) => ({ zone: p.split('/')[0] ?? '', hq: p.split('/')[1] ?? '' })),
      };
    });

  it('previews without writing', async () => {
    const result = await useCase.execute(read('Diwali,2026-11-08,NATIONAL,,\n'), { dryRun: true }, 'admin');
    expect(result).toMatchObject({ created: 1, skipped: 0 });
    expect(await holidays.list({ from: '2026-01-01', to: '2026-12-31' })).toHaveLength(0);
  });

  it('creates, and skips what is already there on a second upload', async () => {
    const rows = read('Diwali,2026-11-08,NATIONAL,,\nDurga Puja,2026-10-20,ZONE,West Bengal,\nSiliguri Day,2026-10-25,HQ,,West Bengal/Siliguri\n');
    expect(await useCase.execute(rows, { dryRun: false }, 'admin')).toMatchObject({ created: 3, skipped: 0 });
    const again = await useCase.execute(rows, { dryRun: false }, 'admin');
    expect(again).toMatchObject({ created: 0, skipped: 3 });
    expect(await holidays.list({ from: '2026-01-01', to: '2026-12-31' })).toHaveLength(3);
  });

  it('rejects the whole file when a place is unknown, inactive or the row repeats', async () => {
    const rows = read('A,2026-11-08,ZONE,Nowhere,\nB,2026-11-09,HQ,,West Bengal/Old\nC,2026-11-10,NATIONAL,,\nc,2026-11-10,NATIONAL,,\n');
    const err = await useCase.execute(rows, { dryRun: false }, 'admin').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(400);
    expect(await holidays.list({ from: '2026-01-01', to: '2026-12-31' })).toHaveLength(0);
  });
});
