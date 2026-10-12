import { describe, expect, it } from 'vitest';
import { narrowToTeam, resolveTeamScope } from './teamScope.js';

const downline = async (managerId: string) =>
  managerId === 'asm' ? [{ id: 'mr1' }, { id: 'mr2' }] : [];

describe('resolveTeamScope', () => {
  it('is the whole downline when no one is named', async () => {
    expect(await resolveTeamScope(downline, 'asm')).toEqual(['mr1', 'mr2']);
  });

  it('is just the named person when they are in the downline', async () => {
    expect(await resolveTeamScope(downline, 'asm', 'mr2')).toEqual(['mr2']);
  });

  it('refuses a person outside the downline with a 403, not an empty list', async () => {
    await expect(resolveTeamScope(downline, 'asm', 'stranger')).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(resolveTeamScope(downline, 'mr1', 'mr2')).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('is empty for a manager with no team', async () => {
    expect(await resolveTeamScope(downline, 'mr1')).toEqual([]);
  });
});

describe('narrowToTeam', () => {
  it('is the same rule for a list already in hand', () => {
    expect(narrowToTeam(['a', 'b'])).toEqual(['a', 'b']);
    expect(narrowToTeam(['a', 'b'], 'b')).toEqual(['b']);
    expect(() => narrowToTeam(['a', 'b'], 'c')).toThrowError(
      expect.objectContaining({ statusCode: 403 }),
    );
  });
});
