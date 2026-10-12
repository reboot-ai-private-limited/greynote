import type { AlertMarksPort } from '../domain/ports.js';
import { AlertMarkModel } from './alertMark.schema.js';

export class MongoAlertMarksAdapter implements AlertMarksPort {
  async claim(keys: string[]): Promise<string[]> {
    const fresh: string[] = [];
    for (const key of keys) {
      // One atomic upsert per key: of two servers racing, exactly one sees `upsertedCount === 1`.
      const result = await AlertMarkModel.updateOne(
        { key },
        { $setOnInsert: { key, createdAt: new Date() } },
        { upsert: true },
      );
      if (result.upsertedCount === 1) fresh.push(key);
    }
    return fresh;
  }
}
