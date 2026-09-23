import { Schema, model } from 'mongoose';

interface SystemConfigDocument {
  key: string;
  value: string;
  module: string;
  description: string;
  updatedBy: string | null;
  updatedAt: Date;
}

const systemConfigSchema = new Schema<SystemConfigDocument>({
  key: { type: String, required: true, unique: true },
  value: { type: String, required: true },
  module: { type: String, required: true },
  description: { type: String, required: true, default: '' },
  updatedBy: { type: String, default: null },
  updatedAt: { type: Date, default: () => new Date() },
});

export const SystemConfigModel = model<SystemConfigDocument>('SystemConfig', systemConfigSchema);
