import { describe, expect, it } from 'vitest';
import { describeRecalculation } from './recalculation';

describe('describeRecalculation', () => {
  it('is a plain confirmation when no report came back (name or status edit)', () => {
    expect(describeRecalculation(undefined)).toEqual({ message: 'HQ updated.', tone: 'success' });
  });

  it('counts the recalculated routes', () => {
    expect(describeRecalculation({ recalculated: 2, failed: 0, overridden: [] })).toEqual({
      message: 'HQ updated. 2 routes recalculated from the new base place.',
      tone: 'success',
    });
    expect(describeRecalculation({ recalculated: 1, failed: 0, overridden: [] }).message).toContain('1 route recalculated');
  });

  it('says so when the HQ has nothing to recalculate', () => {
    expect(describeRecalculation({ recalculated: 0, failed: 0, overridden: [] }).message).toContain('no active routes');
  });

  it('is an error when any route could not be recalculated, so it is not missed', () => {
    const r = describeRecalculation({ recalculated: 1, failed: 2, overridden: [] });
    expect(r.tone).toBe('error');
    expect(r.message).toContain('2 routes could not be recalculated');
  });

  it('names routes kept on a manual distance, and counts the rest', () => {
    const overridden = ['A', 'B', 'C', 'D', 'E'].map((name) => ({ id: name, name }));
    const r = describeRecalculation({ recalculated: 0, failed: 0, overridden });
    expect(r.tone).toBe('success');
    expect(r.message).toContain('Kept the manually entered distance on A, B, C and 2 more — check them.');
    expect(describeRecalculation({ recalculated: 0, failed: 0, overridden: [{ id: 'x', name: 'Only' }] }).message).toContain('check it.');
  });
});
