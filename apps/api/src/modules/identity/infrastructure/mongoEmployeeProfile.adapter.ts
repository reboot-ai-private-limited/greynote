import { Types } from 'mongoose';
import type { EmployeeProfile } from '../domain/employeeProfile.entity.js';
import type { EmployeeProfileRepositoryPort } from '../domain/employeeProfile.repository.port.js';
import { EmployeeProfileModel, type EmployeeProfileDoc } from './employeeProfile.schema.js';

/** Real chains are ~5 levels (MR→ASM→RSM→ZSM→NSM); this only bounds a corrupted, looping tree. */
const MAX_DOWNLINE_DEPTH = 50;

function toEmployeeProfile(doc: EmployeeProfileDoc & { _id: unknown }): EmployeeProfile {
  return {
    id: String(doc._id),
    userId: String(doc.userId),
    designationId: doc.designationId ? String(doc.designationId) : null,
    payBandId: doc.payBandId ? String(doc.payBandId) : null,
    managerId: doc.managerId ? String(doc.managerId) : null,
    dateOfJoining: doc.dateOfJoining,
    probationMonths: doc.probationMonths ?? null,
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

  async findDownline(managerId: string): Promise<Array<{ userId: string; managerId: string; depth: number }>> {
    const rootId = new Types.ObjectId(managerId);
    // Start at the direct reports, then let $graphLookup walk managerId downward from each. Its
    // depthField counts from 0 at the first hop below the start document, hence the +2 below.
    const rows = await EmployeeProfileModel.aggregate<{
      userId: Types.ObjectId;
      managerId: Types.ObjectId;
      below: Array<{ userId: Types.ObjectId; managerId: Types.ObjectId; depth: number }>;
    }>([
      { $match: { managerId: rootId } },
      {
        $graphLookup: {
          from: EmployeeProfileModel.collection.name,
          startWith: '$userId',
          connectFromField: 'userId',
          connectToField: 'managerId',
          as: 'below',
          depthField: 'depth',
          maxDepth: MAX_DOWNLINE_DEPTH,
        },
      },
      { $project: { userId: 1, managerId: 1, 'below.userId': 1, 'below.managerId': 1, 'below.depth': 1 } },
    ]);

    // Keep the shallowest depth per user; drop the root in case bad data loops back to it.
    const byUser = new Map<string, { userId: string; managerId: string; depth: number }>();
    const add = (userId: Types.ObjectId, manager: Types.ObjectId, depth: number) => {
      const id = String(userId);
      if (id === managerId) return;
      const seen = byUser.get(id);
      if (!seen || depth < seen.depth) byUser.set(id, { userId: id, managerId: String(manager), depth });
    };
    for (const row of rows) {
      add(row.userId, row.managerId, 1);
      for (const below of row.below) add(below.userId, below.managerId, below.depth + 2);
    }
    return [...byUser.values()];
  }

  async findUserIdsByFilter(filter: { designationId?: string; managerId?: string }): Promise<string[]> {
    const query: Record<string, unknown> = {};
    if (filter.designationId) query.designationId = new Types.ObjectId(filter.designationId);
    if (filter.managerId) query.managerId = new Types.ObjectId(filter.managerId);

    const docs = await EmployeeProfileModel.find(query).select('userId').lean();
    return docs.map((doc) => String(doc.userId));
  }
}
