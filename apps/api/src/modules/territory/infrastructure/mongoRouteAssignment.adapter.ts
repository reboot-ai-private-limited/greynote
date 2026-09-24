import { Types } from 'mongoose';
import { AppError } from '@/shared/errors/AppError.js';
import type { RouteAssignment } from '../domain/routeAssignment.entity.js';
import type { RouteAssignmentRepositoryPort } from '../domain/routeAssignment.repository.port.js';
import type { TerritoryStatus } from '../domain/territoryStatus.js';
import { RouteAssignmentModel, type RouteAssignmentDoc } from './routeAssignment.schema.js';

function toAssignment(doc: RouteAssignmentDoc & { _id: unknown }): RouteAssignment {
  return {
    id: String(doc._id),
    routeId: String(doc.routeId),
    userId: String(doc.userId),
    status: doc.status,
    assignedAt: doc.assignedAt,
    assignedBy: String(doc.assignedBy),
    unassignedAt: doc.unassignedAt,
    unassignedBy: doc.unassignedBy === null ? null : String(doc.unassignedBy),
  };
}

export class MongoRouteAssignmentAdapter implements RouteAssignmentRepositoryPort {
  async findActive(routeId: string, userId: string): Promise<RouteAssignment | null> {
    const doc = await RouteAssignmentModel.findOne({
      routeId: new Types.ObjectId(routeId),
      userId: new Types.ObjectId(userId),
      status: 'active',
    }).lean();
    return doc ? toAssignment(doc) : null;
  }

  async listForRoute(routeId: string, status?: TerritoryStatus): Promise<RouteAssignment[]> {
    const docs = await RouteAssignmentModel.find({
      routeId: new Types.ObjectId(routeId),
      ...(status && { status }),
    })
      .sort({ assignedAt: -1 })
      .lean();
    return docs.map(toAssignment);
  }

  async listActiveForUser(userId: string): Promise<RouteAssignment[]> {
    const docs = await RouteAssignmentModel.find({ userId: new Types.ObjectId(userId), status: 'active' }).lean();
    return docs.map(toAssignment);
  }

  countActiveForRoute(routeId: string): Promise<number> {
    return RouteAssignmentModel.countDocuments({ routeId: new Types.ObjectId(routeId), status: 'active' });
  }

  async create(input: { routeId: string; userId: string; assignedBy: string }): Promise<RouteAssignment> {
    try {
      const doc = await RouteAssignmentModel.create({
        routeId: new Types.ObjectId(input.routeId),
        userId: new Types.ObjectId(input.userId),
        status: 'active',
        assignedAt: new Date(),
        assignedBy: new Types.ObjectId(input.assignedBy),
      });
      return toAssignment(doc.toObject());
    } catch (err) {
      // Two concurrent assigns that both passed the use case's check — the partial index lets one win.
      if ((err as { code?: number }).code === 11000) {
        throw AppError.conflict('That employee is already assigned to this route.', { field: 'userId' });
      }
      throw err;
    }
  }

  async deactivate(id: string, unassignedBy: string): Promise<RouteAssignment> {
    const doc = await RouteAssignmentModel.findOneAndUpdate(
      // Conditional on still being active, so a double unassign can't overwrite who ended it.
      { _id: id, status: 'active' },
      { status: 'inactive', unassignedAt: new Date(), unassignedBy: new Types.ObjectId(unassignedBy) },
      { new: true },
    ).lean();
    if (!doc) throw AppError.notFound('That employee is not assigned to this route.');
    return toAssignment(doc);
  }
}
