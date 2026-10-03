import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime } from './format';

describe('formatDate / formatDateTime', () => {
  it('show Indian time whatever the browser zone: 18:30 UTC is already the next day, midnight, in India', () => {
    expect(formatDate('2026-09-30T18:30:00Z')).toBe('1 Oct 2026');
    expect(formatDateTime('2026-09-30T18:30:00Z')).toMatch(/^1 Oct 2026,? 12:00 am$/i);
  });
  it('shows the hour and minute in 12-hour form', () => {
    expect(formatDateTime('2026-10-01T09:35:00Z')).toMatch(/^1 Oct 2026,? 3:05 pm$/i);
  });
});
