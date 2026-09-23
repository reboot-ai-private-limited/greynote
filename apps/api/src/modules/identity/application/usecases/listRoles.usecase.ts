import type { Role } from '../../domain/role.entity.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';

export class ListRolesUseCase {
  constructor(private readonly repository: RoleRepositoryPort) {}

  execute(): Promise<Role[]> {
    return this.repository.list();
  }
}
