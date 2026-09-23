import { ROLE_NAMES } from '@greynote/contracts';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';

/**
 * Idempotent — upserts the 4 fixed `Role` rows by name. Seeded (unlike Designation/PayBand)
 * because the value set is closed and referenced directly by business logic
 * (`role.name === 'ADMIN'`), whereas Designation/PayBand are open-ended Admin-populated data.
 */
export class SeedDefaultRolesUseCase {
  constructor(private readonly repository: RoleRepositoryPort) {}

  async execute(): Promise<void> {
    for (const name of ROLE_NAMES) {
      if (!(await this.repository.findByName(name))) {
        await this.repository.create(name);
      }
    }
  }
}
