import { describe, expect, it } from 'vitest';
import { deactivateBlock, resetPasswordError } from './security';

describe('resetPasswordError', () => {
  it('asks for a password, then applies the same rule as creation', () => {
    expect(resetPasswordError('')).toBe('Enter a new password.');
    expect(resetPasswordError('short')).toMatch(/at least 8/);
    expect(resetPasswordError('long-enough-1')).toBeUndefined();
    expect(resetPasswordError('é'.repeat(37))).toMatch(/72 bytes/);
  });
});

describe('deactivateBlock', () => {
  it('refuses your own account', () => {
    expect(deactivateBlock({ id: 'me', status: 'active' }, 'me')).toBe('self');
  });
  it('refuses an account that is already inactive', () => {
    expect(deactivateBlock({ id: 'u1', status: 'inactive' }, 'me')).toBe('already');
  });
  it('allows anyone else, whether active or still onboarding', () => {
    expect(deactivateBlock({ id: 'u1', status: 'active' }, 'me')).toBeNull();
    expect(deactivateBlock({ id: 'u1', status: 'pending' }, 'me')).toBeNull();
  });
  it('says self first when both apply', () => {
    expect(deactivateBlock({ id: 'me', status: 'inactive' }, 'me')).toBe('self');
  });
});
