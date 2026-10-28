import { readConfigOr, type ConfigReader } from '@/shared/config/readConfig.js';
import type { InboxMessageRepositoryPort, InboxReceiptRepositoryPort } from '../../domain/inbox.repository.port.js';
import { clearSystemNotifications } from '../clearSystemNotifications.js';

export const INBOX_RETENTION_KEY = 'INBOX_NOTIFICATION_RETENTION_DAYS';
const DEFAULT_RETENTION_DAYS = 7;
const parseDays = (value: string): number => {
  const n = Number(value);
  if (!/^\d+$/.test(value) || n > 365) throw new RangeError(`Not a whole number from 0 to 365: ${value}`);
  return n;
};
const DAY_MS = 24 * 60 * 60 * 1000;

/** The job behind the retention setting: removes system notifications older than it. 0 keeps them for ever. */
export class PurgeSystemNotificationsUseCase {
  constructor(
    private readonly messages: InboxMessageRepositoryPort,
    private readonly receipts: InboxReceiptRepositoryPort,
    private readonly config: ConfigReader,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async run(): Promise<{ deleted: number }> {
    const days = await readConfigOr(this.config, INBOX_RETENTION_KEY, parseDays, DEFAULT_RETENTION_DAYS);
    if (days <= 0) return { deleted: 0 };
    return { deleted: await clearSystemNotifications(this.messages, this.receipts, new Date(this.now().getTime() - days * DAY_MS)) };
  }
}
