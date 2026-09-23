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
 * Solves the chicken-and-egg problem of the very first login on an empty DB (decision 3/18):
 * creating a `User` normally requires an authenticated Admin, so this seeds exactly one from env
 * vars if none exists. Gated on "does any ADMIN-role user exist" — not a one-time flag — so it
 * self-heals if the DB is ever reset. Every Admin/HR/Accountant after this one is created the
 * ordinary way, through `POST /api/identity/users` by this first Admin.
 */
export class SeedBootstrapAdminUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly roleRepository: RoleRepositoryPort,
    private readonly passwordHasher: PasswordHasherPort,
  ) {}

  async execute(input: BootstrapAdminInput | undefined): Promise<void> {
    if (await this.userRepository.existsAdmin()) return;

    if (!input) {
      // The process still starts and serves /api/health — crashing here would prevent even
      // confirming the deploy reached this point. The fix is "set the env vars and redeploy,"
      // which needs a reachable process.
      logger.fatal(
        'No ADMIN user exists and BOOTSTRAP_ADMIN_* env vars are unset — set them and restart to create the first Admin.',
      );
      return;
    }

    const role = await this.roleRepository.findByName('ADMIN');
    if (!role) {
      logger.fatal('Cannot bootstrap the Admin user — the ADMIN role has not been seeded.');
      return;
    }

    const passwordHash = await this.passwordHasher.hash(input.password);
    const now = new Date();

    const draft: Omit<User, 'id'> = {
      employeeCode: input.employeeCode,
      name: input.name,
      email: input.email,
      phone: input.phone,
      mobileNumber: null,
      guardianName: null,
      dateOfBirth: null,
      address: null,
      qualification: null,
      bankDetails: null,
      documents: [],
      status: 'active',
      roleId: role.id,
      designationId: null,
      payBandId: null,
      managerId: null,
      passwordHash,
      dateOfJoining: now,
      lastLoginAt: null,
      isBlocked: false,
      blockedReason: null,
      blockedAt: null,
      unblockedBy: null,
      unblockedAt: null,
    };

    await this.userRepository.create(draft);
    logger.info({ employeeCode: input.employeeCode }, 'bootstrap Admin created');
  }
}
