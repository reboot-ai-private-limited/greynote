import { Types, type ClientSession } from 'mongoose';
import { AppError } from '@/shared/errors/AppError.js';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { DeviceStatus, UserDevice } from '../domain/userDevice.entity.js';
import type { UserDeviceRepositoryPort } from '../domain/userDevice.repository.port.js';
import { UserDeviceModel, type UserDeviceDoc } from './userDevice.schema.js';

function toUserDevice(doc: UserDeviceDoc & { _id: unknown }): UserDevice {
  return {
    id: String(doc._id),
    userId: String(doc.userId),
    deviceId: doc.deviceId,
    deviceName: doc.deviceName,
    deviceModel: doc.deviceModel,
    platform: doc.platform,
    status: doc.status,
    requestedAt: doc.requestedAt,
    decidedAt: doc.decidedAt,
    decidedBy: doc.decidedBy ? String(doc.decidedBy) : null,
    expiresAt: doc.expiresAt,
  };
}

// Mongo's TTL sweeper runs about once a minute, so an expired rejection can still be on disk.
const notExpired = () => ({ $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] });

export class MongoUserDeviceAdapter implements UserDeviceRepositoryPort {
  async findById(id: string): Promise<UserDevice | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await UserDeviceModel.findById(id).lean();
    return doc ? toUserDevice(doc) : null;
  }

  async findLive(userId: string, deviceId: string): Promise<UserDevice | null> {
    const doc = await UserDeviceModel.findOne({
      userId: new Types.ObjectId(userId),
      deviceId,
      status: { $in: ['PENDING', 'REGISTERED', 'REJECTED'] },
      ...notExpired(),
    }).lean();
    return doc ? toUserDevice(doc) : null;
  }

  async countSlotsUsed(userId: string): Promise<number> {
    return UserDeviceModel.countDocuments({
      userId: new Types.ObjectId(userId),
      status: { $in: ['PENDING', 'REGISTERED'] },
    });
  }

  async countRegistered(userId: string): Promise<number> {
    return UserDeviceModel.countDocuments({ userId: new Types.ObjectId(userId), status: 'REGISTERED' });
  }

  async createPending(
    input: Pick<UserDevice, 'userId' | 'deviceId' | 'deviceName' | 'deviceModel' | 'platform'>,
  ): Promise<UserDevice> {
    // An expired rejection the TTL sweeper hasn't deleted yet would trip the unique index.
    await UserDeviceModel.deleteOne({
      userId: new Types.ObjectId(input.userId),
      deviceId: input.deviceId,
      status: 'REJECTED',
      expiresAt: { $lte: new Date() },
    });
    try {
      const doc = await UserDeviceModel.create({
        ...input,
        userId: new Types.ObjectId(input.userId),
        status: 'PENDING',
        requestedAt: new Date(),
      });
      return toUserDevice(doc);
    } catch (err) {
      // Two logins from the same phone at once: the second loses the unique index race.
      if ((err as { code?: number }).code === 11000) {
        const existing = await this.findLive(input.userId, input.deviceId);
        if (existing) return existing;
      }
      throw err;
    }
  }

  async setStatus(
    id: string,
    change: { status: DeviceStatus; decidedBy: string; expiresAt?: Date | null },
    ctx?: TransactionContext,
  ): Promise<UserDevice> {
    const doc = await UserDeviceModel.findByIdAndUpdate(
      id,
      {
        status: change.status,
        decidedBy: new Types.ObjectId(change.decidedBy),
        decidedAt: new Date(),
        expiresAt: change.expiresAt ?? null,
      },
      { new: true, ...(ctx ? { session: ctx as ClientSession } : {}) },
    ).lean();
    if (!doc) throw AppError.internal('INTERNAL', { reason: 'USER_DEVICE_NOT_FOUND', id });
    return toUserDevice(doc);
  }

  async listForUser(userId: string): Promise<UserDevice[]> {
    const docs = await UserDeviceModel.find({ userId: new Types.ObjectId(userId) })
      .sort({ requestedAt: -1 })
      .lean();
    return docs.map(toUserDevice);
  }

  async listPending(): Promise<UserDevice[]> {
    const docs = await UserDeviceModel.find({ status: 'PENDING' }).sort({ requestedAt: 1 }).lean();
    return docs.map(toUserDevice);
  }
}
