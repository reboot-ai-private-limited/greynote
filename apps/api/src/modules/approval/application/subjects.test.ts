import { describe, expect, it } from 'vitest';
import { dayTitle, describeEach, monthTitle } from './subjects.js';

describe('dayTitle and monthTitle', () => {
  it('write the day and the month the way the portal shows them', () => {
    expect(dayTitle('2026-10-22')).toBe('22 Oct 2026');
    expect(dayTitle('2026-11-03')).toBe('3 Nov 2026');
    expect(monthTitle('2026-11')).toBe('Nov 2026');
  });
});

describe('describeEach', () => {
  it('describes the records it finds and leaves out the ones it does not', async () => {
    const describe = describeEach(
      async (id: string) => (id === 'a' ? { day: '2026-10-22' } : null),
      (r) => ({ title: dayTitle(r.day), subtitle: null }),
    );
    expect(await describe(['a', 'gone'])).toEqual(new Map([['a', { title: '22 Oct 2026', subtitle: null }]]));
  });
});
