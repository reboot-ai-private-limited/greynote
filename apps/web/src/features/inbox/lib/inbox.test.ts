import { describe, expect, it } from 'vitest';
import { EMPTY_MESSAGE, attachmentError, buildMessage, describeAudience, messageForm, toggle, togglePerson } from './inbox';

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

  it('sends to named people, alone or with other parts', () => {
    const people = [{ id: 'u1', label: 'Asha (GHC001)' }, { id: 'u2', label: 'Ravi (GHC002)' }];
    const built = buildMessage({ ...ok, everyone: false, people, roles: ['HR'] }, NOW);
    expect(built.ok && built.body.audience).toEqual({ everyone: false, roles: ['HR'], zoneIds: [], hqIds: [], userIds: ['u1', 'u2'] });
    expect(buildMessage({ ...ok, everyone: false, people: [people[0]!] }, NOW).ok).toBe(true);
  });

  it('takes a message of any length', () => {
    expect(buildMessage({ ...ok, body: 'x'.repeat(50_000) }, NOW).ok).toBe(true);
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

describe('people and files', () => {
  it('adds a person once and takes them off again', () => {
    const a = { id: 'u1', label: 'Asha' };
    expect(togglePerson([], a)).toEqual([a]);
    expect(togglePerson([a], a)).toEqual([]);
  });

  const file = (name: string, size = 10) => new File([new Uint8Array(size)], name);
  it('allows up to 5 PDFs, pictures or Office files of 10 MB each', () => {
    expect(attachmentError([file('a.pdf'), file('b.JPG'), file('c.docx'), file('d.xlsx'), file('e.pptx')])).toBeUndefined();
    expect(attachmentError(Array.from({ length: 6 }, (_, i) => file(`${i}.pdf`)))).toBe('Attach at most 5 files.');
    expect(attachmentError([file('setup.exe')])).toMatch(/can’t be attached/);
    expect(attachmentError([file('old.doc')])).toMatch(/can’t be attached/);
    expect(attachmentError([file('big.pdf', 10 * 1024 * 1024 + 1)])).toBe('“big.pdf” is over 10 MB.');
    expect(attachmentError([file('empty.pdf', 0)])).toBe('“empty.pdf” is empty.');
  });

  it('builds the multipart body: the message as JSON, the files beside it', () => {
    const built = buildMessage(ok, NOW);
    if (!built.ok) throw new Error('expected a message');
    const form = messageForm(built.body, [file('a.pdf'), file('b.png')]);
    expect(JSON.parse(form.get('payload') as string)).toMatchObject({ title: 'Town hall', audience: { everyone: true } });
    expect(form.getAll('files').map((f) => (f as File).name)).toEqual(['a.pdf', 'b.png']);
  });
});
