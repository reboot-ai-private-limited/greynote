import type { RoleName } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import type { Role } from '../../domain/role.entity.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';

export class CreateRoleUseCase {
  constructor(private readonly repository: RoleRepositoryPort) {}

  async execute(name: RoleName): Promise<Role> {
    if (await this.repository.findByName(name)) {
      throw AppError.conflict('That role already exists.', { field: 'name' });
    }
    return this.repository.create(name);
  }
}
