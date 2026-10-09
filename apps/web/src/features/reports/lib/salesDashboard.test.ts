import { describe, expect, it } from 'vitest';
import {
  achievementPercent,
  addDays,
  complianceText,
  complianceTone,
  financialYearMonths,
  presetRange,
  routesText,
} from './salesDashboard';

describe('presetRange', () => {
  it('today is one day; last 7 days is today and the six before, across a month end', () => {
    expect(presetRange('today', '2026-10-09')).toEqual({ from: '2026-10-09', to: '2026-10-09' });
    expect(presetRange('week', '2026-10-03')).toEqual({ from: '2026-09-27', to: '2026-10-03' });
  });
  it('addDays crosses a year end', () => expect(addDays('2026-12-31', 1)).toBe('2027-01-01'));
});

describe('complianceText', () => {
  it('a single day is Yes or No', () => {
    expect(complianceText({ submitted: 0, approved: 0 }, 1, true)).toBe('No');
    expect(complianceText({ submitted: 1, approved: 0 }, 1, true)).toBe('Yes, submitted');
    expect(complianceText({ submitted: 1, approved: 1 }, 1, true)).toBe('Yes, approved');
  });
  it('a day off is Off, not No', () =>
    expect(complianceText({ submitted: 0, approved: 0 }, 0, true)).toBe('Off'));
  it('several days show approved and submitted of the working days', () => {
    expect(complianceText({ submitted: 5, approved: 3 }, 6, false)).toBe(
      '3/6 approved · 5/6 submitted',
    );
  });
  it('tones: none submitted is danger, all approved is success, otherwise warning', () => {
    expect(complianceTone({ submitted: 0, approved: 0 }, 6)).toBe('danger');
    expect(complianceTone({ submitted: 6, approved: 6 }, 6)).toBe('success');
    expect(complianceTone({ submitted: 6, approved: 2 }, 6)).toBe('warning');
    expect(complianceTone({ submitted: 0, approved: 0 }, 0)).toBe('neutral');
  });
});

describe('achievementPercent', () => {
  it('is null without a target or an achievement, and may pass 100', () => {
    expect(achievementPercent({ targetPaise: null, achievedPaise: 5 })).toBeNull();
    expect(achievementPercent({ targetPaise: 100, achievedPaise: null })).toBeNull();
    expect(achievementPercent({ targetPaise: 200, achievedPaise: 300 })).toBe(150);
  });
});

describe('financialYearMonths', () => {
  it('runs April to March', () => {
    const m = financialYearMonths(2026);
    expect(m[0]).toBe('2026-04');
    expect(m[11]).toBe('2027-03');
    expect(m).toHaveLength(12);
  });
});

describe('routesText', () => {
  it('shows two names and the rest as a count', () => {
    expect(routesText([])).toBe('—');
    expect(routesText(['A', 'B'])).toBe('A, B');
    expect(routesText(['A', 'B', 'C', 'D'])).toBe('A, B +2');
  });
});
