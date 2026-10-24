import { describe, expect, it } from 'vitest';
import { activeTab, approvalTabsFor, tabCaption } from './approvalTabs';

describe('approvalTabsFor', () => {
  it('gives Admin a tab for each kind, Daily plan first and no "All"', () => {
    const tabs = approvalTabsFor('ADMIN');
    expect(tabs[0]).toEqual({ value: 'DAILY_PLAN', label: 'Daily plan' });
    expect(tabs.some((t) => t.value === '')).toBe(false);
    expect(tabs.map((t) => t.value)).toEqual(expect.arrayContaining(['LEAVE', 'DCR', 'DAILY_PLAN', 'MONTHLY_PLAN', 'NEW_DOCTOR', 'DOCTOR_SERVICE']));
    expect(new Set(tabs.map((t) => t.value)).size).toBe(tabs.length);
  });
  it('gives HR the plan and leave tabs only', () => {
    expect(approvalTabsFor('HR').map((t) => t.value)).toEqual(['DAILY_PLAN', 'MONTHLY_PLAN', 'LEAVE']);
  });
});

describe('activeTab', () => {
  const tabs = approvalTabsFor('ADMIN');
  it('is the tab the URL names, else the first', () => {
    expect(activeTab(tabs, 'LEAVE')).toBe('LEAVE');
    expect(activeTab(tabs, '')).toBe('DAILY_PLAN');
    expect(activeTab(tabs, 'NOPE')).toBe('DAILY_PLAN');
  });
  it('is empty when there are no tabs', () => {
    expect(activeTab([], 'LEAVE')).toBe('');
  });
});

describe('tabCaption', () => {
  it('shows the waiting count once known, including zero', () => {
    expect(tabCaption('Leave', 3)).toBe('Leave · 3');
    expect(tabCaption('Leave', 0)).toBe('Leave · 0');
    expect(tabCaption('Leave', undefined)).toBe('Leave');
  });
});
