import type { RoleName } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import type { Role } from '../../domain/role.entity.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';

export class UpdateRoleUseCase {
  constructor(private readonly repository: RoleRepositoryPort) {}

  async execute(id: string, name: RoleName): Promise<Role> {
    if (!(await this.repository.findById(id))) throw AppError.notFound();
    return this.repository.update(id, name);
  }
}
