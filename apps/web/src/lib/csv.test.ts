import { describe, expect, it } from 'vitest';
import { csvCell, rupeesForCsv, toCsv } from './csv';

describe('csvCell', () => {
  it('leaves a plain value alone and writes nothing for null and undefined', () => {
    expect(csvCell('Asha Rao')).toBe('Asha Rao');
    expect(csvCell(1500)).toBe('1500');
    expect(csvCell(true)).toBe('true');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });
  it('quotes a cell with a comma, quote or newline, doubling a quote inside', () => {
    expect(csvCell('Rao, Asha')).toBe('"Rao, Asha"');
    expect(csvCell('said "hi"')).toBe('"said ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
  });
  it('defuses text a spreadsheet would run as a formula', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell('+1+1')).toBe("'+1+1");
    expect(csvCell('-2+3')).toBe("'-2+3");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });
  it('does not touch a negative number, which is a number and not a formula', () => {
    expect(csvCell(-1500)).toBe('-1500');
  });
});

describe('toCsv', () => {
  it('writes a header and rows with CRLF endings', () => {
    expect(toCsv(['Name', 'Net'], [['Asha', 1], ['Rao, B', 2]])).toBe('Name,Net\r\nAsha,1\r\n"Rao, B",2\r\n');
  });
  it('writes just the header for no rows', () => {
    expect(toCsv(['A', 'B'], [])).toBe('A,B\r\n');
  });
});

describe('rupeesForCsv', () => {
  it('writes rupees with two decimals, no grouping, and a sign for a negative', () => {
    expect(rupeesForCsv(1234550)).toBe('12345.50');
    expect(rupeesForCsv(5)).toBe('0.05');
    expect(rupeesForCsv(0)).toBe('0.00');
    expect(rupeesForCsv(-1500)).toBe('-15.00');
  });
});
