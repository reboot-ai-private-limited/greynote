import { describe, expect, it } from 'vitest';
import { generatePassword } from '@/modules/identity/domain/passwordGenerator.js';
import { adminFromEnv, databaseName, parsePayBands, refusalReason } from './productionSeed.js';

const ok = { nodeEnv: 'production', mongoUri: 'mongodb+srv://u:p@c.mongodb.net/greynote-prod?retryWrites=true', confirmDb: 'greynote-prod', existingUsers: 0 };

describe('databaseName', () => {
  it('reads the path segment', () => {
    expect(databaseName(ok.mongoUri)).toBe('greynote-prod');
    expect(databaseName('mongodb://localhost:27017/greynote')).toBe('greynote');
  });
  it('is null without one', () => {
    expect(databaseName('mongodb+srv://u:p@c.mongodb.net/?x=1')).toBeNull();
    expect(databaseName('mongodb+srv://u:p@c.mongodb.net')).toBeNull();
  });
});

describe('refusalReason', () => {
  it('allows an empty database that was confirmed by name', () => {
    expect(refusalReason(ok)).toBeNull();
  });
  it('refuses outside production', () => {
    expect(refusalReason({ ...ok, nodeEnv: 'development' })).toMatch(/NODE_ENV/);
  });
  it('refuses without or with the wrong confirmation', () => {
    expect(refusalReason({ ...ok, confirmDb: undefined })).toMatch(/--confirm-db=greynote-prod/);
    expect(refusalReason({ ...ok, confirmDb: 'greynote' })).toMatch(/does not match/);
  });
  it('refuses a database that already has users', () => {
    expect(refusalReason({ ...ok, existingUsers: 3 })).toMatch(/already has 3 user/);
  });
  it('refuses a URI with no database name', () => {
    expect(refusalReason({ ...ok, mongoUri: 'mongodb+srv://u:p@c.mongodb.net/?x=1' })).toMatch(/no database name/);
  });
});

describe('adminFromEnv', () => {
  const env = { ADMIN_CODE: 'ADMIN01', ADMIN_NAME: 'A', ADMIN_EMAIL: 'a@x.com', ADMIN_PHONE: '9' };
  it('reads the four values', () => {
    expect(adminFromEnv(env)).toEqual({ employeeCode: 'ADMIN01', name: 'A', email: 'a@x.com', phone: '9' });
  });
  it('names what is missing', () => {
    expect(() => adminFromEnv({ ADMIN_CODE: 'x' })).toThrow(/ADMIN_NAME, ADMIN_EMAIL, ADMIN_PHONE/);
    expect(() => adminFromEnv({ ...env, ADMIN_EMAIL: 'nope' })).toThrow(/ADMIN_EMAIL/);
  });
});

describe('parsePayBands', () => {
  const band = { name: 'G1', taPerKmRatePaise: 750, hqDaPaise: 20000, exStationDaPaise: 30000, outStationDaPaise: 40000 };
  it('accepts a list', () => {
    expect(parsePayBands([band, { ...band, name: 'G2' }])).toHaveLength(2);
  });
  it('refuses empty, decimal and duplicate', () => {
    expect(() => parsePayBands([])).toThrow();
    expect(() => parsePayBands([{ ...band, hqDaPaise: 10.5 }])).toThrow();
    expect(() => parsePayBands([band, { ...band, name: ' g1 ' }])).toThrow(/twice/);
  });
});

describe('the Admin password', () => {
  it('is 16 characters with a lower-case, upper-case and digit, and differs each time', () => {
    const a = generatePassword(16);
    const b = generatePassword(16);
    expect(a).toHaveLength(16);
    expect(a).toMatch(/[a-z]/);
    expect(a).toMatch(/[A-Z]/);
    expect(a).toMatch(/\d/);
    expect(a).not.toBe(b);
  });
});
