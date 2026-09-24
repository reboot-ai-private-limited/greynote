import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv.js';
import { readHierarchyCsv } from './hierarchyImport.csv.js';

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, embedded commas/newlines, CRLF and a BOM', () => {
    const text = '﻿zone,hq\r\n"West Bengal, North","Siliguri ""Main"""\r\n"Multi\nLine",X\r\n';
    expect(parseCsv(text)).toEqual([
      { line: 1, cells: ['zone', 'hq'] },
      { line: 2, cells: ['West Bengal, North', 'Siliguri "Main"'] },
      { line: 3, cells: ['Multi\nLine', 'X'] },
    ]);
  });

  it('drops blank lines but keeps real line numbers', () => {
    expect(parseCsv('zone\n\nA\n,\nB').map((r) => r.line)).toEqual([1, 3, 5]);
  });

  it('rejects an unclosed quote', () => {
    expect(() => parseCsv('zone\n"oops')).toThrow();
  });
});

describe('readHierarchyCsv', () => {
  it('reads zone-only, zone+hq and full rows, normalizing names and area types', () => {
    const { rows, errors } = readHierarchyCsv(
      'Zone,HQ,Area,Area Type\nWest  Bengal,,,\nWest Bengal,Siliguri,,\nWest Bengal,Siliguri,Matigara,ex station\n',
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { line: 2, zone: 'West Bengal', hq: undefined },
      { line: 3, zone: 'West Bengal', hq: 'Siliguri' },
      { line: 4, zone: 'West Bengal', hq: 'Siliguri', area: { name: 'Matigara', type: 'EX_STATION' } },
    ]);
  });

  it('reports every bad row by line', () => {
    const { errors } = readHierarchyCsv('zone,hq,area,area_type\n,X,,\nA,,Matigara,HQ\nA,B,C,MOON\nA,B,,HQ\n');
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4, 5]);
    expect(errors[2]?.message).toContain('MOON');
  });

  it('needs a zone column, and hq + area_type when there is an area column', () => {
    expect(readHierarchyCsv('hq\nX').errors[0]?.message).toContain('"zone"');
    expect(readHierarchyCsv('zone,area\nA,B').errors[0]?.message).toContain('"hq"');
  });
});
