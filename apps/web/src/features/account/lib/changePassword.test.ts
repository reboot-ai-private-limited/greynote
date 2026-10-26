import { describe, expect, it } from 'vitest';
import { changePasswordErrors } from './changePassword';

const ok = { current: 'Old-Passw0rd', next: 'N3w-Passw0rd', again: 'N3w-Passw0rd' };

describe('changePasswordErrors', () => {
  it('accepts a valid change', () => {
    expect(changePasswordErrors(ok)).toEqual({});
  });
  it('asks for every field', () => {
    expect(changePasswordErrors({ current: '', next: '', again: '' })).toEqual({
      current: 'Enter your current password.',
      next: 'Enter a new password.',
    });
  });
  it('applies the creation rules to the new password', () => {
    expect(changePasswordErrors({ ...ok, next: 'short', again: 'short' }).next).toMatch(/at least 8/);
    expect(changePasswordErrors({ ...ok, next: 'é'.repeat(37), again: 'é'.repeat(37) }).next).toMatch(/72 bytes/);
  });
  it('refuses the same password as before', () => {
    expect(changePasswordErrors({ ...ok, next: ok.current, again: ok.current }).next).toMatch(/different/);
  });
  it('wants the retype to match', () => {
    expect(changePasswordErrors({ ...ok, again: 'N3w-Passw0rd!' })).toEqual({ again: 'The two passwords do not match.' });
  });
});
