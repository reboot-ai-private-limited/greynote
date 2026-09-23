import { Types } from 'mongoose';
import type { EmployeeProfile } from '../domain/employeeProfile.entity.js';
import type { EmployeeProfileRepositoryPort } from '../domain/employeeProfile.repository.port.js';
import { EmployeeProfileModel, type EmployeeProfileDoc } from './employeeProfile.schema.js';

function toEmployeeProfile(doc: EmployeeProfileDoc & { _id: unknown }): EmployeeProfile {
  return {
    id: String(doc._id),
    userId: String(doc.userId),
    designationId: doc.designationId ? String(doc.designationId) : null,
    payBandId: doc.payBandId ? String(doc.payBandId) : null,
    managerId: doc.managerId ? String(doc.managerId) : null,
    dateOfJoining: doc.dateOfJoining,
    mobileNumber: doc.mobileNumber,
    guardianName: doc.guardianName,
    dateOfBirth: doc.dateOfBirth,
    address: doc.address,
    qualification: doc.qualification,
    bankDetails: doc.bankDetails,
    documents: doc.documents,
  };
}

/** Converts the string-id fields a domain `EmployeeProfile` patch carries into `ObjectId`s. */
function toDocFields(input: Partial<Omit<EmployeeProfile, 'id' | 'userId'>>): Record<string, unknown> {
  const doc: Record<string, unknown> = { ...input };
  if (input.designationId !== undefined) {
    doc.designationId = input.designationId ? new Types.ObjectId(input.designationId) : null;
  }
  if (input.payBandId !== undefined) {
    doc.payBandId = input.payBandId ? new Types.ObjectId(input.payBandId) : null;
  }
  if (input.managerId !== undefined) {
    doc.managerId = input.managerId ? new Types.ObjectId(input.managerId) : null;
  }
  return doc;
}

export class MongoEmployeeProfileAdapter implements EmployeeProfileRepositoryPort {
  async findByUserId(userId: string): Promise<EmployeeProfile | null> {
    const doc = await EmployeeProfileModel.findOne({ userId: new Types.ObjectId(userId) }).lean();
    return doc ? toEmployeeProfile(doc) : null;
  }

  async findByUserIds(userIds: string[]): Promise<EmployeeProfile[]> {
    if (userIds.length === 0) return [];
    const docs = await EmployeeProfileModel.find({
      userId: { $in: userIds.map((id) => new Types.ObjectId(id)) },
    }).lean();
    return docs.map(toEmployeeProfile);
  }

  async upsert(userId: string, input: Partial<Omit<EmployeeProfile, 'id' | 'userId'>>): Promise<EmployeeProfile> {
    const doc = await EmployeeProfileModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      { $set: toDocFields(input), $setOnInsert: { userId: new Types.ObjectId(userId) } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    // `doc` is never null here: upsert:true + new:true always returns the (created-or-updated) document.
    return toEmployeeProfile(doc as EmployeeProfileDoc & { _id: unknown });
  }

  async findUserIdsByFilter(filter: { designationId?: string; managerId?: string }): Promise<string[]> {
    const query: Record<string, unknown> = {};
    if (filter.designationId) query.designationId = new Types.ObjectId(filter.designationId);
    if (filter.managerId) query.managerId = new Types.ObjectId(filter.managerId);

    const docs = await EmployeeProfileModel.find(query).select('userId').lean();
    return docs.map((doc) => String(doc.userId));
  }
}
