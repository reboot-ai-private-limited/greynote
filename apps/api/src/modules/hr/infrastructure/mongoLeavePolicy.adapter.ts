import { Types } from 'mongoose';
import type { LeavePolicy } from '../domain/leavePolicy.entity.js';
import type { LeavePolicyRepositoryPort } from '../domain/leavePolicy.repository.port.js';
import { LeavePolicyModel, type LeavePolicyDoc } from './leavePolicy.schema.js';

const toPolicy = (doc: LeavePolicyDoc & { _id: unknown }): LeavePolicy => ({
  id: String(doc._id),
  payBandId: String(doc.payBandId),
  leaveTypeId: String(doc.leaveTypeId),
  defaultDays: doc.defaultDays,
  updatedBy: String(doc.updatedBy),
  updatedAt: doc.updatedAt,
});

export class MongoLeavePolicyAdapter implements LeavePolicyRepositoryPort {
  async list(): Promise<LeavePolicy[]> {
    return (await LeavePolicyModel.find().lean()).map(toPolicy);
  }

  async listForPayBand(payBandId: string): Promise<LeavePolicy[]> {
    return (await LeavePolicyModel.find({ payBandId: new Types.ObjectId(payBandId) }).lean()).map(toPolicy);
  }

  async upsert(input: Omit<LeavePolicy, 'id' | 'updatedAt'>): Promise<LeavePolicy> {
    const doc = await LeavePolicyModel.findOneAndUpdate(
      { payBandId: new Types.ObjectId(input.payBandId), leaveTypeId: new Types.ObjectId(input.leaveTypeId) },
      { $set: { defaultDays: input.defaultDays, updatedBy: new Types.ObjectId(input.updatedBy), updatedAt: new Date() } },
      { new: true, upsert: true },
    ).lean();
    return toPolicy(doc!);
  }

  async existsForLeaveType(leaveTypeId: string): Promise<boolean> {
    return (await LeavePolicyModel.exists({ leaveTypeId: new Types.ObjectId(leaveTypeId) })) !== null;
  }
}
