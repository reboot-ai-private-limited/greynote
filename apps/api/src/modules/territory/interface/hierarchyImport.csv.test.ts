import { describe, expect, it } from 'vitest';
import { parseCsv } from '@/shared/csv/csv.js';
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
  it('reads zone-only and zone+hq rows, normalizing names', () => {
    const { rows, errors } = readHierarchyCsv('Zone,HQ\nWest  Bengal,\nWest Bengal,SLG-1\n');
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { line: 2, zone: 'West Bengal', hq: undefined },
      { line: 3, zone: 'West Bengal', hq: 'SLG-1' },
    ]);
  });

  it('reports every bad row by line', () => {
    const { errors } = readHierarchyCsv(`zone,hq\n,X\nA,${'x'.repeat(101)}\nA,B\n`);
    expect(errors.map((e) => e.line)).toEqual([2, 3]);
  });

  it('needs a zone column', () => {
    expect(readHierarchyCsv('hq\nX').errors[0]?.message).toContain('"zone"');
  });

  it('refuses a file that still has the retired area columns, rather than ignoring them', () => {
    for (const header of ['zone,hq,area,area_type', 'zone,hq,Area', 'zone,hq,Area Type']) {
      const { rows, errors } = readHierarchyCsv(`${header}\nA,B,C,HQ\n`);
      expect(rows).toEqual([]);
      expect(errors[0]?.message).toContain('Areas no longer exist');
    }
  });
});
