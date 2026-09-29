import { Types, type ClientSession, type FilterQuery } from 'mongoose';
import { AppError } from '@/shared/errors/AppError.js';
import { toSkipLimit } from '@/shared/http/pagination.js';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { User } from '../domain/user.entity.js';
import type {
  UserListFilters,
  UserListPagination,
  UserRepositoryPort,
} from '../domain/user.repository.port.js';
import { EmployeeProfileModel } from './employeeProfile.schema.js';
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
    status: doc.status,
    roleId: String(doc.roleId),
    passwordHash: doc.passwordHash,
    lastLoginAt: doc.lastLoginAt,
    isBlocked: doc.isBlocked,
  };
}

/** Converts the string-id fields a domain `User` carries into the `ObjectId`s Mongoose expects. */
function toDocFields(input: Partial<Omit<User, 'id'>>): Record<string, unknown> {
  const doc: Record<string, unknown> = { ...input };
  if (input.roleId !== undefined) doc.roleId = new Types.ObjectId(input.roleId);
  return doc;
}

export class MongoUserAdapter implements UserRepositoryPort {
  async findById(id: string): Promise<User | null> {
    const doc = await UserModel.findById(id).lean();
    return doc ? toUser(doc) : null;
  }

  async findByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) return [];
    const docs = await UserModel.find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } }).lean();
    return docs.map(toUser);
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
    if (filters.designationId || filters.managerId) {
      // designationId/managerId live on EmployeeProfile now — resolve which users match there
      // first, then constrain the User query by _id. Simpler than an aggregation $lookup for a
      // filter combination this infrequent (Admin-driven queries, not a hot path).
      const profileFilter: { designationId?: string; managerId?: string } = {};
      if (filters.designationId) profileFilter.designationId = filters.designationId;
      if (filters.managerId) profileFilter.managerId = filters.managerId;
      const matchingUserIds = await EmployeeProfileModel.find({
        ...(profileFilter.designationId && { designationId: new Types.ObjectId(profileFilter.designationId) }),
        ...(profileFilter.managerId && { managerId: new Types.ObjectId(profileFilter.managerId) }),
      })
        .select('userId')
        .lean();
      query._id = { $in: matchingUserIds.map((doc) => doc.userId) };
    }
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

  async update(id: string, input: Partial<Omit<User, 'id'>>, ctx?: TransactionContext): Promise<User> {
    const doc = await UserModel.findByIdAndUpdate(id, toDocFields(input), {
      new: true,
      ...(ctx ? { session: ctx as ClientSession } : {}),
    }).lean();
    if (!doc) throw AppError.internal('INTERNAL', { reason: 'USER_NOT_FOUND', id });
    return toUser(doc);
  }

  async listActiveIdsByRole(role: 'FIELD'): Promise<string[]> {
    const found = await RoleModel.findOne({ name: role }).lean();
    if (!found) return [];
    return (await UserModel.find({ roleId: found._id, status: 'active' }, { _id: 1 }).sort({ _id: 1 }).lean()).map((u) => String(u._id));
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
