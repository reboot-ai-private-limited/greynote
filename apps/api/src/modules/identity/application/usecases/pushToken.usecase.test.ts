import { describe, expect, it } from 'vitest';
import { PushTokenUseCase } from './pushToken.usecase.js';
import type { PushTokenRepositoryPort } from '../../domain/pushToken.repository.port.js';

/** Rows are `user:device -> token`; a device with no row has no live session. */
function setup(live: string[]) {
  const tokens = new Map<string, string | null>(live.map((k) => [k, null]));
  const repo: PushTokenRepositoryPort = {
    setForDevice: async (userId, deviceId, token) => {
      const key = `${userId}:${deviceId}`;
      if (!tokens.has(key)) return false;
      tokens.set(key, token);
      return true;
    },
    clearTokens: async (list) => {
      for (const [k, v] of tokens) if (v && list.includes(v)) tokens.set(k, null);
    },
    listForUsers: async (ids) => [...tokens].filter(([k, v]) => v && ids.includes(k.split(':')[0] as string)).map(([, v]) => v as string),
  };
  return { useCase: new PushTokenUseCase(repo), tokens };
}

const TOKEN = 'x'.repeat(30);

describe('PushTokenUseCase', () => {
  it('stores the token on the device’s live session', async () => {
    const t = setup(['u1:d1']);
    await t.useCase.register('u1', 'd1', TOKEN);
    expect(t.tokens.get('u1:d1')).toBe(TOKEN);
  });

  it('moves a token that now belongs to another account', async () => {
    const t = setup(['u1:d1', 'u2:d1']);
    await t.useCase.register('u1', 'd1', TOKEN);
    await t.useCase.register('u2', 'd1', TOKEN);
    expect(t.tokens.get('u1:d1')).toBeNull();
    expect(t.tokens.get('u2:d1')).toBe(TOKEN);
  });

  it('refuses a device with no live session', async () => {
    await expect(setup([]).useCase.register('u1', 'd1', TOKEN)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('unregistering is idempotent', async () => {
    const t = setup(['u1:d1']);
    await t.useCase.register('u1', 'd1', TOKEN);
    await t.useCase.unregister('u1', 'd1');
    await t.useCase.unregister('u1', 'nope');
    expect(t.tokens.get('u1:d1')).toBeNull();
  });
});
