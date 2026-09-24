import type { SystemConfigEntry, SystemConfigSeed } from '../domain/systemConfig.entity.js';
import type { SystemConfigRepositoryPort } from '../domain/systemConfig.repository.port.js';
import { SystemConfigModel } from './systemConfig.schema.js';

export class MongoSystemConfigAdapter implements SystemConfigRepositoryPort {
  async findByKey(key: string): Promise<SystemConfigEntry | null> {
    const doc = await SystemConfigModel.findOne({ key }).lean();
    if (!doc) return null;
    return {
      key: doc.key,
      value: doc.value,
      module: doc.module,
      description: doc.description,
      updatedBy: doc.updatedBy,
      updatedAt: doc.updatedAt,
    };
  }

  async updateValue(key: string, value: string, updatedBy: string): Promise<SystemConfigEntry | null> {
    const doc = await SystemConfigModel.findOneAndUpdate(
      { key },
      { value, updatedBy, updatedAt: new Date() },
      { new: true },
    ).lean();
    if (!doc) return null;
    return {
      key: doc.key,
      value: doc.value,
      module: doc.module,
      description: doc.description,
      updatedBy: doc.updatedBy,
      updatedAt: doc.updatedAt,
    };
  }

  async upsertSeed(entries: SystemConfigSeed[]): Promise<void> {
    await Promise.all(
      entries.map((entry) =>
        SystemConfigModel.updateOne(
          { key: entry.key },
          {
            $setOnInsert: {
              key: entry.key,
              value: entry.value,
              module: entry.module,
              description: entry.description,
              updatedBy: null,
              updatedAt: new Date(),
            },
          },
          { upsert: true },
        ),
      ),
    );
  }
}
