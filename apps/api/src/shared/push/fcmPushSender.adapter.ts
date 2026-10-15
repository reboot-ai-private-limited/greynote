import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import { logger } from '@/shared/logging/logger.js';
import type { PushMessage, PushResult, PushSenderPort } from './pushSender.port.js';

/** FCM accepts at most 500 tokens per multicast call. */
const BATCH = 500;
const DEAD_CODES = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);

/** Used when Firebase is not configured or switched off — the Inbox still works, nothing is pushed. */
export class NoopPushSender implements PushSenderPort {
  async send(tokens: string[], message: PushMessage): Promise<PushResult> {
    if (tokens.length > 0) logger.debug({ devices: tokens.length, title: message.title }, 'push skipped: Firebase not configured');
    return { sent: 0, failed: 0, deadTokens: [] };
  }
}

export class FcmPushSender implements PushSenderPort {
  private messaging: Messaging | null = null;

  constructor(private readonly serviceAccountJson: string) {}

  private client(): Messaging {
    if (this.messaging) return this.messaging;
    const existing = getApps()[0];
    const app: App = existing ?? initializeApp({ credential: cert(JSON.parse(this.serviceAccountJson)) });
    this.messaging = getMessaging(app);
    return this.messaging;
  }

  async send(tokens: string[], message: PushMessage): Promise<PushResult> {
    const result: PushResult = { sent: 0, failed: 0, deadTokens: [] };
    try {
      const messaging = this.client();
      for (let i = 0; i < tokens.length; i += BATCH) {
        const batch = tokens.slice(i, i + BATCH);
        const response = await messaging.sendEachForMulticast({
          tokens: batch,
          notification: { title: message.title, body: message.body },
          data: message.data ?? {},
          android: { priority: 'high' },
        });
        response.responses.forEach((r, index) => {
          if (r.success) result.sent += 1;
          else {
            result.failed += 1;
            if (r.error && DEAD_CODES.has(r.error.code)) result.deadTokens.push(batch[index]!);
          }
        });
      }
    } catch (err) {
      // Bad credentials, network, quota: log and carry on — the caller's real work must not fail over a nudge.
      logger.error({ err }, 'push send failed');
      result.failed = tokens.length - result.sent;
    }
    return result;
  }
}

export function buildPushSender(serviceAccountJson: string | undefined): PushSenderPort {
  if (!serviceAccountJson) return new NoopPushSender();
  try {
    JSON.parse(serviceAccountJson);
  } catch {
    logger.error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON; push is off');
    return new NoopPushSender();
  }
  return new FcmPushSender(serviceAccountJson);
}
