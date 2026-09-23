import { AppError } from '@/shared/errors/AppError.js';
import { logger } from '@/shared/logging/logger.js';
import type { PasswordHasherPort } from '../../domain/passwordHasher.port.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';
import type { User } from '../../domain/user.entity.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';

export interface BootstrapAdminInput {
  employeeCode: string;
  name: string;
  email: string;
  phone: string;
  password: string;
}

/**
 * Solves the chicken-and-egg problem of the very first login on an empty DB: creating a `User`
 * normally requires an authenticated Admin, so this seeds exactly one. Called only from
 * `scripts/seed.ts`, which prompts an operator for `input` interactively — never from env vars,
 * so a plaintext admin password never has to sit in `.env`/`.env.prod` (see `docs/decision-log.md`).
 * Gated on "does any ADMIN-role user exist" — not a one-time flag — so it self-heals if the DB is
 * ever reset. Every Admin/HR/Accountant after this one is created the ordinary way, through
 * `POST /api/identity/users` by this first Admin.
 */
export class SeedBootstrapAdminUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly roleRepository: RoleRepositoryPort,
    private readonly passwordHasher: PasswordHasherPort,
  ) {}

  async execute(input: BootstrapAdminInput): Promise<void> {
    if (await this.userRepository.existsAdmin()) return;

    const role = await this.roleRepository.findByName('ADMIN');
    if (!role) {
      // seed.ts always calls seedRoles() first — reaching here means that step was skipped.
      throw AppError.internal('INTERNAL', { reason: 'ADMIN_ROLE_NOT_SEEDED' });
    }

    const passwordHash = await this.passwordHasher.hash(input.password);

    const draft: Omit<User, 'id'> = {
      employeeCode: input.employeeCode,
      name: input.name,
      email: input.email,
      phone: input.phone,
      status: 'active',
      roleId: role.id,
      passwordHash,
      lastLoginAt: null,
      isBlocked: false,
    };

    await this.userRepository.create(draft);
    logger.info({ employeeCode: input.employeeCode }, 'bootstrap Admin created');
  }
}
