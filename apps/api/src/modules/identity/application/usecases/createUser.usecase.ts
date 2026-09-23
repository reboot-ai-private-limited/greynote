import type { RoleName } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import { computeUserStatus } from '../../domain/onboarding.js';
import type { PasswordHasherPort } from '../../domain/passwordHasher.port.js';
import type { DesignationRepositoryPort } from '../../domain/designation.repository.port.js';
import type { PayBandRepositoryPort } from '../../domain/payBand.repository.port.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';
import { toUserSummary, type User, type UserSummary } from '../../domain/user.entity.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';

/** Discriminated on `role` — decision 12: one endpoint, two shapes. */
export type CreateUserInput =
  | {
      role: 'FIELD';
      employeeCode: string;
      name: string;
      password: string;
      email?: string;
      phone?: string;
      designationId?: string;
      payBandId?: string;
      managerId?: string;
    }
  | {
      role: 'ADMIN' | 'HR' | 'ACCOUNTANT';
      employeeCode: string;
      name: string;
      password: string;
      email?: string;
      phone?: string;
    };

export class CreateUserUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly roleRepository: RoleRepositoryPort,
    private readonly designationRepository: DesignationRepositoryPort,
    private readonly payBandRepository: PayBandRepositoryPort,
    private readonly passwordHasher: PasswordHasherPort,
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

    if (await this.userRepository.existsByEmployeeCode(input.employeeCode)) {
      throw AppError.conflict('That employee code is already in use.', { field: 'employeeCode' });
    }
    if (input.email && (await this.userRepository.existsByEmail(input.email))) {
      throw AppError.conflict('That email is already in use.', { field: 'email' });
    }

    const role = await this.roleRepository.findByName(input.role);
    if (!role) throw AppError.internal('INTERNAL', { reason: 'ROLE_NOT_FOUND', role: input.role });

    let designationId: string | null = null;
    let payBandId: string | null = null;
    let managerId: string | null = null;

    if (input.role === 'FIELD') {
      if (input.designationId) {
        const designation = await this.designationRepository.findById(input.designationId);
        if (!designation) throw AppError.badRequest('Unknown designation.', { field: 'designationId' });
        designationId = designation.id;
      }
      if (input.payBandId) {
        const payBand = await this.payBandRepository.findById(input.payBandId);
        if (!payBand) throw AppError.badRequest('Unknown pay band.', { field: 'payBandId' });
        payBandId = payBand.id;
      }
      if (input.managerId) {
        const manager = await this.userRepository.findById(input.managerId);
        if (!manager) throw AppError.badRequest('Unknown manager.', { field: 'managerId' });
        managerId = manager.id;
      }
    }
    // designation/payBand/manager stay null for non-FIELD roles even if somehow supplied — the
    // discriminated input type already prevents that at compile time.

    const passwordHash = await this.passwordHasher.hash(input.password);
    const now = new Date();

    const draft: Omit<User, 'id'> = {
      employeeCode: input.employeeCode,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      mobileNumber: null,
      guardianName: null,
      dateOfBirth: null,
      address: null,
      qualification: null,
      bankDetails: null,
      documents: [],
      status: 'pending' as const,
      roleId: role.id,
      designationId,
      payBandId,
      managerId,
      passwordHash,
      dateOfJoining: now,
      lastLoginAt: null,
      isBlocked: false,
      blockedReason: null,
      blockedAt: null,
      unblockedBy: null,
      unblockedAt: null,
    };

    const created = await this.userRepository.create({
      ...draft,
      status: computeUserStatus(draft, input.role),
    });

    return toUserSummary(created, input.role);
  }
}
