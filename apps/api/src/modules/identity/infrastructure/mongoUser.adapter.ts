import { Types, type FilterQuery } from 'mongoose';
import { AppError } from '@/shared/errors/AppError.js';
import { toSkipLimit } from '@/shared/http/pagination.js';
import type { User } from '../domain/user.entity.js';
import type {
  UserListFilters,
  UserListPagination,
  UserRepositoryPort,
} from '../domain/user.repository.port.js';
import { RoleModel } from './role.schema.js';
import { UserModel, type UserDoc } from './user.schema.js';

/** Escapes a search string for safe use inside a `RegExp` — untrusted user input otherwise. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toUser(doc: UserDoc & { _id: unknown }): User {
  return {
    id: String(doc._id),
    employeeCode: doc.employeeCode,
    name: doc.name,
    email: doc.email,
    phone: doc.phone,
    mobileNumber: doc.mobileNumber,
    guardianName: doc.guardianName,
    dateOfBirth: doc.dateOfBirth,
    address: doc.address,
    qualification: doc.qualification,
    bankDetails: doc.bankDetails,
    documents: doc.documents,
    status: doc.status,
    roleId: String(doc.roleId),
    designationId: doc.designationId ? String(doc.designationId) : null,
    payBandId: doc.payBandId ? String(doc.payBandId) : null,
    managerId: doc.managerId ? String(doc.managerId) : null,
    passwordHash: doc.passwordHash,
    dateOfJoining: doc.dateOfJoining,
    lastLoginAt: doc.lastLoginAt,
    isBlocked: doc.isBlocked,
    blockedReason: doc.blockedReason,
    blockedAt: doc.blockedAt,
    unblockedBy: doc.unblockedBy ? String(doc.unblockedBy) : null,
    unblockedAt: doc.unblockedAt,
  };
}

/** Converts the string-id fields a domain `User` carries into the `ObjectId`s Mongoose expects. */
function toDocFields(input: Partial<Omit<User, 'id'>>): Record<string, unknown> {
  const doc: Record<string, unknown> = { ...input };
  if (input.roleId !== undefined) doc.roleId = new Types.ObjectId(input.roleId);
  if (input.designationId !== undefined) {
    doc.designationId = input.designationId ? new Types.ObjectId(input.designationId) : null;
  }
  if (input.payBandId !== undefined) {
    doc.payBandId = input.payBandId ? new Types.ObjectId(input.payBandId) : null;
  }
  if (input.managerId !== undefined) {
    doc.managerId = input.managerId ? new Types.ObjectId(input.managerId) : null;
  }
  if (input.unblockedBy !== undefined) {
    doc.unblockedBy = input.unblockedBy ? new Types.ObjectId(input.unblockedBy) : null;
  }
  return doc;
}

export class MongoUserAdapter implements UserRepositoryPort {
  async findById(id: string): Promise<User | null> {
    const doc = await UserModel.findById(id).lean();
    return doc ? toUser(doc) : null;
  }

  async findByEmployeeCode(employeeCode: string): Promise<User | null> {
    const doc = await UserModel.findOne({ employeeCode }).lean();
    return doc ? toUser(doc) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const doc = await UserModel.findOne({ email }).lean();
    return doc ? toUser(doc) : null;
  }

  async list(
    pagination: UserListPagination,
    filters: UserListFilters,
  ): Promise<{ items: User[]; total: number }> {
    const query: FilterQuery<UserDoc> = {};

    if (filters.role) {
      const role = await RoleModel.findOne({ name: filters.role }).lean();
      // No such role exists → an impossible id, so the query legitimately matches nothing
      // instead of accidentally matching everything.
      query.roleId = role ? role._id : new Types.ObjectId();
    }
    if (filters.designationId) query.designationId = new Types.ObjectId(filters.designationId);
    if (filters.managerId) query.managerId = new Types.ObjectId(filters.managerId);
    if (filters.status) query.status = filters.status;
    if (filters.isBlocked !== undefined) query.isBlocked = filters.isBlocked;
    if (filters.search) {
      const regex = new RegExp(escapeRegex(filters.search), 'i');
      query.$or = [{ employeeCode: regex }, { name: regex }, { email: regex }];
    }

    const { skip, limit } = toSkipLimit(pagination);
    const sortField = pagination.sortBy ?? 'name';
    const sortOrder = pagination.sortOrder === 'desc' ? -1 : 1;

    const [docs, total] = await Promise.all([
      UserModel.find(query).sort({ [sortField]: sortOrder }).skip(skip).limit(limit).lean(),
      UserModel.countDocuments(query),
    ]);

    return { items: docs.map(toUser), total };
  }

  async create(input: Omit<User, 'id'>): Promise<User> {
    const doc = await UserModel.create(toDocFields(input));
    return toUser(doc);
  }

  async update(id: string, input: Partial<Omit<User, 'id'>>): Promise<User> {
    const doc = await UserModel.findByIdAndUpdate(id, toDocFields(input), { new: true }).lean();
    if (!doc) throw AppError.internal('INTERNAL', { reason: 'USER_NOT_FOUND', id });
    return toUser(doc);
  }

  async existsByEmployeeCode(employeeCode: string): Promise<boolean> {
    return (await UserModel.exists({ employeeCode })) !== null;
  }

  async existsByEmail(email: string): Promise<boolean> {
    return (await UserModel.exists({ email })) !== null;
  }

  async existsAdmin(): Promise<boolean> {
    const adminRole = await RoleModel.findOne({ name: 'ADMIN' }).lean();
    if (!adminRole) return false;
    return (await UserModel.exists({ roleId: adminRole._id })) !== null;
  }
}
