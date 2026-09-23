import type { RoleName } from '@greynote/contracts';
import type { Role } from './role.entity.js';

export interface RoleRepositoryPort {
  findById(id: string): Promise<Role | null>;
  findByName(name: RoleName): Promise<Role | null>;
  list(): Promise<Role[]>;
  create(name: RoleName): Promise<Role>;
  update(id: string, name: RoleName): Promise<Role>;
}
