import { describe, expect, it } from 'vitest';
import { attentionItems, statusChips } from './employeeChips';

describe('statusChips', () => {
  it('lists All with the sum, then each status with its count', () => {
    expect(statusChips({ active: 14, pending: 5, inactive: 1 })).toEqual([
      { value: '', label: 'All', count: 20 },
      { value: 'active', label: 'Active', count: 14 },
      { value: 'pending', label: 'Onboarding', count: 5 },
      { value: 'inactive', label: 'Inactive', count: 1 },
    ]);
  });
});

describe('attentionItems', () => {
  it('names who needs attention, singular or plural, with the filter that shows them', () => {
    expect(attentionItems({ active: 1, pending: 5, inactive: 0, blocked: 1 })).toEqual([
      { key: 'pending', text: '5 are still being onboarded', filter: { status: 'pending' } },
      { key: 'blocked', text: '1 is blocked from submitting', filter: { blocked: '1' } },
    ]);
  });

  it('lists nothing when nothing needs attention', () => {
    expect(attentionItems({ active: 9, pending: 0, inactive: 2, blocked: 0 })).toEqual([]);
  });
});
