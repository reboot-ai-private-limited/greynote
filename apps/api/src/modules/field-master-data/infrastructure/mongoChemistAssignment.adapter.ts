import { Types } from 'mongoose';
import type { ChemistAssignment } from '../domain/chemistAssignment.entity.js';
import type { ChemistAssignmentRepositoryPort } from '../domain/chemistAssignment.repository.port.js';
import { ChemistAssignmentModel, type ChemistAssignmentDoc } from './chemistAssignment.schema.js';
import { isDuplicateKey } from './mongoHelpers.js';

const toAssignment = (doc: ChemistAssignmentDoc & { _id: unknown }): ChemistAssignment => ({
  id: String(doc._id),
  chemistId: String(doc.chemistId),
  userId: String(doc.userId),
  status: doc.status,
  assignedAt: doc.assignedAt,
  assignedBy: String(doc.assignedBy),
  unassignedAt: doc.unassignedAt,
  unassignedBy: doc.unassignedBy === null ? null : String(doc.unassignedBy),
});

const oid = (id: string) => new Types.ObjectId(id);
const ending = (by: string) => ({ status: 'inactive' as const, unassignedAt: new Date(), unassignedBy: oid(by) });

export class MongoChemistAssignmentAdapter implements ChemistAssignmentRepositoryPort {
  async listActiveForChemist(chemistId: string): Promise<ChemistAssignment[]> {
    return (await ChemistAssignmentModel.find({ chemistId: oid(chemistId), status: 'active' }).lean()).map(toAssignment);
  }

  async listActiveForChemists(chemistIds: string[]): Promise<ChemistAssignment[]> {
    if (chemistIds.length === 0) return [];
    return (await ChemistAssignmentModel.find({ chemistId: { $in: chemistIds.map(oid) }, status: 'active' }).lean()).map(toAssignment);
  }

  async listActiveForUsers(userIds: string[]): Promise<ChemistAssignment[]> {
    if (userIds.length === 0) return [];
    return (await ChemistAssignmentModel.find({ userId: { $in: userIds.map(oid) }, status: 'active' }).lean()).map(toAssignment);
  }

  async listForChemist(chemistId: string): Promise<ChemistAssignment[]> {
    return (await ChemistAssignmentModel.find({ chemistId: oid(chemistId) }).sort({ assignedAt: -1, _id: -1 }).lean()).map(toAssignment);
  }

  async isAssigned(userId: string, chemistId: string): Promise<boolean> {
    return (await ChemistAssignmentModel.exists({ chemistId: oid(chemistId), userId: oid(userId), status: 'active' })) !== null;
  }

  async assign(input: { chemistId: string; userId: string; assignedBy: string }): Promise<ChemistAssignment> {
    const where = { chemistId: oid(input.chemistId), userId: oid(input.userId), status: 'active' as const };
    const existing = await ChemistAssignmentModel.findOne(where).lean();
    if (existing) return toAssignment(existing);
    try {
      const doc = await ChemistAssignmentModel.create({ ...where, assignedAt: new Date(), assignedBy: oid(input.assignedBy) });
      return toAssignment(doc.toObject());
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      // A concurrent assign won; the row it made is the answer.
      return toAssignment((await ChemistAssignmentModel.findOne(where).lean())!);
    }
  }

  async unassign(chemistId: string, userId: string, by: string): Promise<boolean> {
    const result = await ChemistAssignmentModel.updateOne({ chemistId: oid(chemistId), userId: oid(userId), status: 'active' }, ending(by));
    return result.matchedCount === 1;
  }

  async endAllForUser(userId: string, by: string): Promise<number> {
    const result = await ChemistAssignmentModel.updateMany({ userId: oid(userId), status: 'active' }, ending(by));
    return result.modifiedCount;
  }
}
