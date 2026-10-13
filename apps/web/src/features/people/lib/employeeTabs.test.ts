import { describe, expect, it } from 'vitest';
import { employeeTabOf, employeeTabsFor } from './employeeTabs';

describe('employeeTabOf', () => {
  it('opens a current tab, and Profile for nothing or something unknown', () => {
    expect(employeeTabOf('pay', true)).toBe('pay');
    expect(employeeTabOf(null, true)).toBe('profile');
    expect(employeeTabOf('nonsense', true)).toBe('profile');
  });

  it('sends an old tab to its new home, so saved links and the CTC screen still work', () => {
    expect(employeeTabOf('compensation', false)).toBe('pay');
    expect(employeeTabOf('bank', false)).toBe('pay');
    expect(employeeTabOf('documents', false)).toBe('profile');
    expect(employeeTabOf('leave', false)).toBe('time');
    expect(employeeTabOf('calendar', false)).toBe('time');
    expect(employeeTabOf('promotion', false)).toBe('career');
  });

  it('keeps Access (devices, security) for Admin', () => {
    expect(employeeTabOf('devices', true)).toBe('access');
    expect(employeeTabOf('security', false)).toBe('profile');
    expect(employeeTabsFor(true)).toEqual(['profile', 'pay', 'time', 'career', 'access']);
    expect(employeeTabsFor(false)).toEqual(['profile', 'pay', 'time', 'career']);
  });
});
