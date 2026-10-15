import type { RoleName } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import { computeUserStatus } from '../../domain/onboarding.js';
import type { EmployeeCodeGeneratorPort } from '../../domain/employeeCode.generator.port.js';
import type { PasswordHasherPort } from '../../domain/passwordHasher.port.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';
import { toUserSummary, type User, type UserSummary } from '../../domain/user.entity.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';

/**
 * Discriminated on `role` — decision 12: one endpoint, two shapes. Both shapes are the SAME
 * shape now — `designationId`/`payBandId`/`managerId` moved to `EmployeeProfile` and are set via
 * the incremental onboarding PATCH (`updateUser.usecase.ts`), never at creation.
 */
export type CreateUserInput = {
  role: RoleName;
  /** Left out for office staff: the next GHC code is generated. */
  employeeCode?: string;
  name: string;
  password: string;
  email?: string;
  phone?: string;
};

export class CreateUserUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly roleRepository: RoleRepositoryPort,
    private readonly passwordHasher: PasswordHasherPort,
    private readonly codes: EmployeeCodeGeneratorPort,
  ) {}

  /** `actingRole` is the authenticated caller's own role — enforced here, not just at the route. */
  async execute(actingRole: RoleName, input: CreateUserInput): Promise<UserSummary> {
    if (input.role === 'FIELD' && actingRole !== 'ADMIN' && actingRole !== 'HR') {
      throw AppError.forbidden();
    }
    if (input.role !== 'FIELD' && actingRole !== 'ADMIN') {
      // "User master" creation (ADMIN/HR/ACCOUNTANT) is Admin-only — HR cannot create HR/Admin/Accountant.
      throw AppError.forbidden();
    }

    let employeeCode = input.employeeCode;
    if (employeeCode === undefined) {
      employeeCode = await this.codes.next();
    } else if (await this.userRepository.existsByEmployeeCode(employeeCode)) {
      throw AppError.conflict('That employee code is already in use.', { field: 'employeeCode' });
    }
    if (input.email && (await this.userRepository.existsByEmail(input.email))) {
      throw AppError.conflict('That email is already in use.', { field: 'email' });
    }

    const role = await this.roleRepository.findByName(input.role);
    if (!role) throw AppError.internal('INTERNAL', { reason: 'ROLE_NOT_FOUND', role: input.role });

    const passwordHash = await this.passwordHasher.hash(input.password);

    const draft: Omit<User, 'id'> = {
      employeeCode,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      status: 'pending' as const,
      roleId: role.id,
      passwordHash,
      lastLoginAt: null,
      isBlocked: false,
    };

    const created = await this.userRepository.create({
      ...draft,
      // No EmployeeProfile exists yet — a FIELD user always starts `pending`; a non-FIELD user is
      // always `active` regardless (computeUserStatus's non-FIELD branch).
      status: computeUserStatus(draft, null, input.role),
    });

    return toUserSummary(created, input.role, null);
  }
}
