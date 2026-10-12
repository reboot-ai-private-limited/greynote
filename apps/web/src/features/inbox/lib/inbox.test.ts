import { describe, expect, it } from 'vitest';
import { EMPTY_MESSAGE, buildMessage, describeAudience, toggle } from './inbox';

const NOW = new Date('2026-10-12T10:00:00Z');
const ok = { ...EMPTY_MESSAGE, title: '  Town  hall ', body: 'Friday 4 pm.' };

describe('buildMessage', () => {
  it('sends to everyone by default, with the title tidied', () => {
    const built = buildMessage(ok, NOW);
    expect(built).toMatchObject({
      ok: true,
      body: { title: 'Town hall', kind: 'ANNOUNCEMENT', audience: { everyone: true } },
    });
  });

  it('needs a title, a message and an audience', () => {
    const built = buildMessage({ ...EMPTY_MESSAGE, everyone: false }, NOW);
    expect(built.ok ? [] : Object.keys(built.errors)).toEqual(['title', 'body', 'audience']);
  });

  it('drops the chosen parts when Everyone is on', () => {
    const built = buildMessage({ ...ok, roles: ['HR'], zoneIds: ['z1'] }, NOW);
    expect(built.ok && built.body.audience).toEqual({
      everyone: true,
      roles: [],
      zoneIds: [],
      hqIds: [],
      userIds: [],
    });
  });

  it('refuses an expiry that has passed', () => {
    expect(
      buildMessage({ ...ok, expiresAt: '2026-10-12T09:00' }, new Date('2026-10-12T10:00:00')).ok,
    ).toBe(false);
    expect(buildMessage({ ...ok, expiresAt: '2099-01-01T09:00' }, NOW).ok).toBe(true);
  });
});

describe('helpers', () => {
  it('toggles a choice', () => {
    expect(toggle(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggle(['a', 'b'], 'a')).toEqual(['b']);
  });
  it('describes an audience', () => {
    expect(
      describeAudience({ everyone: true, roles: [], zoneIds: [], hqIds: [], userIds: [] }),
    ).toBe('Everyone');
    expect(
      describeAudience({
        everyone: false,
        roles: ['FIELD'],
        zoneIds: ['a', 'b'],
        hqIds: ['c'],
        userIds: [],
      }),
    ).toBe('Field employees · 2 zones · 1 HQ');
  });
});
