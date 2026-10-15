import { describe, expect, it } from 'vitest';
import { PushNotifier } from './pushNotifier.js';
import type { PushSenderPort } from './pushSender.port.js';

function setup(opts: { tokens?: string[]; dead?: string[]; enabled?: boolean; throws?: boolean } = {}) {
  const cleared: string[][] = [];
  const calls: string[][] = [];
  const sender: PushSenderPort = {
    send: async (tokens) => {
      if (opts.throws) throw new Error('fcm down');
      calls.push(tokens);
      return { sent: tokens.length, failed: 0, deadTokens: opts.dead ?? [] };
    },
  };
  const notifier = new PushNotifier(
    { listPushTokens: async () => opts.tokens ?? ['t1', 't2'], clearPushTokens: async (t) => void cleared.push(t) },
    sender,
    async () => opts.enabled ?? true,
  );
  return { notifier, calls, cleared };
}

describe('PushNotifier', () => {
  it('sends to the tokens of the named people', async () => {
    const t = setup();
    await t.notifier.pushTo(['u1'], { title: 'a', body: 'b' });
    expect(t.calls).toEqual([['t1', 't2']]);
  });

  it('removes tokens Firebase says are dead', async () => {
    const t = setup({ dead: ['t2'] });
    await t.notifier.pushTo(['u1'], { title: 'a', body: 'b' });
    expect(t.cleared).toEqual([['t2']]);
  });

  it('does nothing when push is switched off, nobody is named or nobody has a token', async () => {
    const off = setup({ enabled: false });
    await off.notifier.pushTo(['u1'], { title: 'a', body: 'b' });
    const none = setup();
    await none.notifier.pushTo([], { title: 'a', body: 'b' });
    const noTokens = setup({ tokens: [] });
    await noTokens.notifier.pushTo(['u1'], { title: 'a', body: 'b' });
    expect([off.calls, none.calls, noTokens.calls]).toEqual([[], [], []]);
  });

  it('never throws into the caller', async () => {
    await expect(setup({ throws: true }).notifier.pushTo(['u1'], { title: 'a', body: 'b' })).resolves.toBeUndefined();
  });
});
