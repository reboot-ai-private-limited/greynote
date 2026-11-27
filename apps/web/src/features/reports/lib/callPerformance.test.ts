import type { CallPerformanceReportDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { avgText, callPerformanceFilename, callPerformanceRows, CALL_PERFORMANCE_HEADER, pctText } from './callPerformance';

const coverage = { doctors: 120, met: 113, withFrequency: 120, metFully: 97, required: 220, made: 195, missed: 7, coveragePct: 94, frequencyPct: 81, compliancePct: 89 };
const report: CallPerformanceReportDto = {
  fromMonth: '2026-11',
  toMonth: '2026-11',
  rows: [{ employee: { id: 'mr1', name: 'Asha', employeeCode: 'E1', designation: 'MR' }, isManager: false, fieldDays: 22, doctorCalls: 198, chemistCalls: 66, doctorCallAvg: 9, chemistCallAvg: 3, scope: 'OWN', coverage }],
  totals: { fieldDays: 22, doctorCalls: 198, chemistCalls: 66, doctorCallAvg: 9, chemistCallAvg: 3, coverage },
};

describe('call average & coverage export', () => {
  it('one row per employee plus the totals, matching the header', () => {
    const rows = callPerformanceRows(report);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveLength(CALL_PERFORMANCE_HEADER.length);
    expect(rows[0]!.slice(0, 12)).toEqual(['Asha', 'E1', 'MR', 'Own', 22, 198, 9, 66, 3, 120, 113, 94]);
    expect(rows[1]![0]).toBe('Total (MRs)');
  });
  it('formats empty figures and names the file by its months', () => {
    expect(pctText(null)).toBe('—');
    expect(avgText(9)).toBe('9.0');
    expect(callPerformanceFilename('2026-10', '2026-11', 'csv')).toBe('GREYNOTE CALL AVERAGE & COVERAGE 2026-10 to 2026-11.csv');
  });
});
