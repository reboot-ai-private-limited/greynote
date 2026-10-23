import type { DcrSummaryDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { EMPLOYEE_DCRS_CSV_HEADER, employeeDcrsCsv, employeeDcrsFilename } from './employeeDcrsCsv';

const dcr = (over: Partial<DcrSummaryDto> = {}): DcrSummaryDto => ({
  id: 'x1',
  userId: 'u1',
  reportDate: '2026-04-02',
  status: 'APPROVED',
  remarks: null,
  approval: { requestId: 'a1', cycle: 1, submittedAt: '2026-04-02T12:00:00.000Z', decidedAt: '2026-04-03T09:00:00.000Z' },
  ...over,
});

describe('employeeDcrsCsv', () => {
  it('is the header, then the days oldest first', () => {
    const lines = employeeDcrsCsv([dcr({ reportDate: '2026-04-05' }), dcr()]).trimEnd().split('\r\n');
    expect(lines[0]).toBe(EMPLOYEE_DCRS_CSV_HEADER.join(','));
    expect(lines[1]).toBe('2026-04-02,APPROVED,,2026-04-02T12:00:00.000Z,2026-04-03T09:00:00.000Z,1');
    expect(lines[2]!.startsWith('2026-04-05')).toBe(true);
  });

  it('leaves the approval cells empty for a draft, and quotes a remark with a comma', () => {
    const lines = employeeDcrsCsv([dcr({ status: 'DRAFT', approval: null, remarks: 'Met X, then Y' })]).trimEnd().split('\r\n');
    expect(lines[1]).toBe('2026-04-02,DRAFT,"Met X, then Y",,,');
  });
});

describe('employeeDcrsFilename', () => {
  it('carries the code and the financial year', () => expect(employeeDcrsFilename('MR001', '2026–27')).toBe('dcr-mr001-2026-27.csv'));
});
