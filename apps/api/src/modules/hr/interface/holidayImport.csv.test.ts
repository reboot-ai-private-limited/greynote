import { describe, expect, it } from 'vitest';
import { readHolidayCsv } from './holidayImport.csv.js';

const HEADER = 'name,date,scope,zones,hqs\n';

describe('readHolidayCsv', () => {
  it('reads the three scopes', () => {
    const { rows, errors } = readHolidayCsv(HEADER + 'Republic Day,2027-01-26,NATIONAL,,\nOnam,2027-09-11,zone,West Bengal;Assam,\nFair,2027-03-05,HQ,,West Bengal/Siliguri\n');
    expect(errors).toEqual([]);
    expect(rows.map((r) => [r.scope, r.zones, r.hqs])).toEqual([
      ['NATIONAL', [], []],
      ['ZONE', ['West Bengal', 'Assam'], []],
      ['HQ', [], [{ zone: 'West Bengal', hq: 'Siliguri' }]],
    ]);
  });

  it('lists every problem by line', () => {
    const { errors } = readHolidayCsv(HEADER + 'A,2027-02-30,NATIONAL,,\nB,2027-01-01,ZONE,,\nC,2027-01-01,HQ,,Siliguri\n');
    expect([...new Set(errors.map((e) => e.line))]).toEqual([2, 3, 4]);
  });

  it('needs the name, date and scope columns', () => {
    expect(readHolidayCsv('name,date\nA,2027-01-01\n').errors[0]?.message).toMatch(/scope/);
  });
});
