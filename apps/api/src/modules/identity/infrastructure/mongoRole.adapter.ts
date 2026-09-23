import type { RoleName } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import type { Role } from '../domain/role.entity.js';
import type { RoleRepositoryPort } from '../domain/role.repository.port.js';
import { RoleModel } from './role.schema.js';

export class MongoRoleAdapter implements RoleRepositoryPort {
  async findById(id: string): Promise<Role | null> {
    const doc = await RoleModel.findById(id).lean();
    return doc ? { id: doc._id.toString(), name: doc.name } : null;
  }

  async findByName(name: RoleName): Promise<Role | null> {
    const doc = await RoleModel.findOne({ name }).lean();
    return doc ? { id: doc._id.toString(), name: doc.name } : null;
  }

  async list(): Promise<Role[]> {
    const docs = await RoleModel.find().lean();
    return docs.map((doc) => ({ id: doc._id.toString(), name: doc.name }));
  }

  async create(name: RoleName): Promise<Role> {
    const doc = await RoleModel.create({ name });
    return { id: doc._id.toString(), name: doc.name };
  }

  async update(id: string, name: RoleName): Promise<Role> {
    const doc = await RoleModel.findByIdAndUpdate(id, { name }, { new: true }).lean();
    // The use case already checks existence before calling update — reaching here means the row
    // vanished between that check and this write, an invariant violation, not caller error.
    if (!doc) throw AppError.internal('INTERNAL', { reason: 'ROLE_NOT_FOUND', id });
    return { id: doc._id.toString(), name: doc.name };
  }
}
