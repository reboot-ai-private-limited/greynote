import { describe, expect, it } from 'vitest';
import { resolveAudience } from './audience.js';
import type { Recipient } from './ports.js';

const people: Recipient[] = [
  { id: 'mr1', role: 'FIELD', hqId: 'hq-a', zoneId: 'z1' },
  { id: 'mr2', role: 'FIELD', hqId: 'hq-b', zoneId: 'z1' },
  { id: 'mr3', role: 'FIELD', hqId: 'hq-c', zoneId: 'z2' },
  { id: 'hr1', role: 'HR', hqId: null, zoneId: null },
  { id: 'adm', role: 'ADMIN', hqId: null, zoneId: null },
];
const none = { everyone: false, roles: [], zoneIds: [], hqIds: [], userIds: [] };

describe('resolveAudience', () => {
  it('reaches everyone', () => {
    expect(resolveAudience({ ...none, everyone: true }, people)).toHaveLength(5);
  });
  it('takes a zone, an HQ, a role or a named person', () => {
    expect(resolveAudience({ ...none, zoneIds: ['z1'] }, people)).toEqual(['mr1', 'mr2']);
    expect(resolveAudience({ ...none, hqIds: ['hq-c'] }, people)).toEqual(['mr3']);
    expect(resolveAudience({ ...none, roles: ['HR'] }, people)).toEqual(['hr1']);
    expect(resolveAudience({ ...none, userIds: ['adm'] }, people)).toEqual(['adm']);
  });
  it('sends a person who matches several parts one copy', () => {
    expect(resolveAudience({ ...none, zoneIds: ['z1'], hqIds: ['hq-a'], userIds: ['mr1'], roles: ['FIELD'] }, people)).toEqual(['mr1', 'mr2', 'mr3']);
  });
  it('reaches nobody on an empty audience', () => {
    expect(resolveAudience(none, people)).toEqual([]);
  });
});
