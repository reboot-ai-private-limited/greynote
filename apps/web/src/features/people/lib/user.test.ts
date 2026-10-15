import { describe, expect, it } from 'vitest';
import { EMPTY_USER_DRAFT, buildUser, creatableRoles, generatePassword, passwordError, type UserDraft } from './user';

const draft: UserDraft = {
  role: 'FIELD',
  name: 'Asha  Rao',
  password: 'Sup3rSecret',
  email: '',
  phone: '',
};

describe('creatableRoles', () => {
  it('lets Admin create every role and HR only the field force', () => {
    expect(creatableRoles('ADMIN')).toEqual(['FIELD', 'HR', 'ACCOUNTANT', 'ADMIN']);
    expect(creatableRoles('HR')).toEqual(['FIELD']);
  });
  it('lets nobody else create anyone', () => {
    expect(creatableRoles('ACCOUNTANT')).toEqual([]);
    expect(creatableRoles(undefined)).toEqual([]);
  });
});

describe('passwordError', () => {
  it('needs 8 characters', () => {
    expect(passwordError('1234567')).toMatch(/at least 8/);
    expect(passwordError('12345678')).toBeUndefined();
  });
  it('counts bytes, not characters, against the 72-byte limit', () => {
    expect(passwordError('a'.repeat(72))).toBeUndefined();
    expect(passwordError('a'.repeat(73))).toMatch(/72 bytes/);
    expect(passwordError('é'.repeat(37))).toMatch(/72 bytes/); // 74 bytes
  });
});

describe('buildUser', () => {
  it('builds a body, normalizing the name and leaving blanks out', () => {
    expect(buildUser(draft, 'HR')).toEqual({
      ok: true,
      body: { role: 'FIELD', name: 'Asha Rao', password: 'Sup3rSecret' },
    });
  });
  it('includes email and phone when given', () => {
    const result = buildUser({ ...draft, email: ' a@b.co ', phone: ' 98300 ' }, 'ADMIN');
    expect(result).toMatchObject({ ok: true, body: { email: 'a@b.co', phone: '98300' } });
  });
  it('sends the password untrimmed', () => {
    expect(buildUser({ ...draft, password: ' spaced pw ' }, 'ADMIN')).toMatchObject({ body: { password: ' spaced pw ' } });
  });
  it('refuses a role the caller may not create', () => {
    expect(buildUser({ ...draft, role: 'ADMIN' }, 'HR')).toMatchObject({ ok: false, errors: { role: 'Choose a role.' } });
    expect(buildUser(draft, 'ACCOUNTANT')).toMatchObject({ ok: false });
  });
  it('refuses a malformed email', () => {
    const result = buildUser({ ...draft, email: 'nope' }, 'ADMIN');
    expect(result).toMatchObject({ ok: false, errors: { email: 'Enter a valid email address.' } });
  });
  it('reports every missing field at once', () => {
    const result = buildUser(EMPTY_USER_DRAFT, 'ADMIN');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['name', 'password', 'role']);
  });
});

describe('generatePassword', () => {
  it('is the requested length, drawn from the safe alphabet', () => {
    const password = generatePassword((max) => max - 1, 16);
    expect(password).toHaveLength(16);
    expect(password).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/);
  });
  it('always satisfies the password rule', () => {
    expect(passwordError(generatePassword(() => 0))).toBeUndefined();
  });
  it('uses the random source for every position', () => {
    let next = 0;
    expect(generatePassword(() => next++, 4)).toBe('ABCD');
  });
});
