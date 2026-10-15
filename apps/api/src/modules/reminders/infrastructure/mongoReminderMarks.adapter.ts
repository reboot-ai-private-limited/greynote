import type { ReminderMarksPort } from '../domain/ports.js';
import { ReminderMarkModel } from './reminderMark.schema.js';

export class MongoReminderMarksAdapter implements ReminderMarksPort {
  async claim(keys: string[]): Promise<string[]> {
    const fresh: string[] = [];
    for (const key of keys) {
      // One atomic upsert per key: of two servers racing, exactly one sees `upsertedCount === 1`.
      const result = await ReminderMarkModel.updateOne({ key }, { $setOnInsert: { key, createdAt: new Date() } }, { upsert: true });
      if (result.upsertedCount === 1) fresh.push(key);
    }
    return fresh;
  }
}
