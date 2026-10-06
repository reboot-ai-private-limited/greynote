import { describe, expect, it } from 'vitest';
import { approvalTabsFor, tabCaption } from './approvalTabs';

describe('approvalTabsFor', () => {
  it('gives Admin everything and then a tab for each kind', () => {
    const tabs = approvalTabsFor('ADMIN');
    expect(tabs[0]).toEqual({ value: '', label: 'All' });
    expect(tabs.map((t) => t.value)).toEqual(expect.arrayContaining(['LEAVE', 'DCR', 'DAILY_PLAN', 'MONTHLY_PLAN', 'DAILY_PLAN_CHANGE', 'NEW_DOCTOR', 'DOCTOR_SERVICE']));
    expect(new Set(tabs.map((t) => t.value)).size).toBe(tabs.length);
  });
  it('gives HR no tabs: it decides leave only', () => {
    expect(approvalTabsFor('HR')).toEqual([]);
  });
});

describe('tabCaption', () => {
  it('shows the waiting count once known, including zero', () => {
    expect(tabCaption('Leave', 3)).toBe('Leave · 3');
    expect(tabCaption('Leave', 0)).toBe('Leave · 0');
    expect(tabCaption('Leave', undefined)).toBe('Leave');
  });
});
