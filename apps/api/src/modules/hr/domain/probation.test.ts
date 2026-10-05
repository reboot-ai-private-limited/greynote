import { describe, expect, it } from 'vitest';
import { probationEndsOn } from './probation.js';

describe('probationEndsOn', () => {
  it('is the joining date plus the months, the first day after probation', () => {
    expect(probationEndsOn('2026-01-15', 6)).toBe('2026-07-15');
    expect(probationEndsOn('2026-10-05', 6)).toBe('2027-04-05');
  });

  it('clamps to the end of a shorter month, and handles leap years', () => {
    expect(probationEndsOn('2026-08-31', 6)).toBe('2027-02-28');
    expect(probationEndsOn('2023-08-31', 6)).toBe('2024-02-29');
    expect(probationEndsOn('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('crosses years, and 0 months ends the day it starts', () => {
    expect(probationEndsOn('2026-12-10', 3)).toBe('2027-03-10');
    expect(probationEndsOn('2026-12-10', 0)).toBe('2026-12-10');
    expect(probationEndsOn('2026-12-10', 36)).toBe('2029-12-10');
  });
});
