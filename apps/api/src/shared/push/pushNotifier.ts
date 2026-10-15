import { logger } from '@/shared/logging/logger.js';
import type { PushMessage, PushSenderPort } from './pushSender.port.js';

/** Where the phones' tokens live; `identity.contract` satisfies it structurally. */
export interface PushTokenSource {
  listPushTokens(userIds: string[]): Promise<string[]>;
  clearPushTokens(tokens: string[]): Promise<void>;
}

/** Sends a message to named people's phones. Never throws; with Firebase off it quietly does nothing. */
export interface PushNotifierPort {
  pushTo(userIds: string[], message: PushMessage): Promise<void>;
}

export class PushNotifier implements PushNotifierPort {
  constructor(
    private readonly tokens: PushTokenSource,
    private readonly sender: PushSenderPort,
    private readonly enabled: () => Promise<boolean> = async () => true,
  ) {}

  async pushTo(userIds: string[], message: PushMessage): Promise<void> {
    try {
      if (userIds.length === 0 || !(await this.enabled())) return;
      const tokens = await this.tokens.listPushTokens(userIds);
      if (tokens.length === 0) return;
      const result = await this.sender.send(tokens, message);
      if (result.deadTokens.length > 0) await this.tokens.clearPushTokens(result.deadTokens);
    } catch (err) {
      logger.error({ err }, 'push failed');
    }
  }
}
