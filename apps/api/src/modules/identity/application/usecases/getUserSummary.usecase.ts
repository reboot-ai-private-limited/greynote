import { AppError } from '@/shared/errors/AppError.js';
import type { EmployeeProfileRepositoryPort } from '../../domain/employeeProfile.repository.port.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';
import { toUserSummary, type UserSummary } from '../../domain/user.entity.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';

export class GetUserSummaryUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly roleRepository: RoleRepositoryPort,
    private readonly employeeProfileRepository: EmployeeProfileRepositoryPort,
  ) {}

  async execute(userId: string): Promise<UserSummary> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw AppError.notFound();

    const role = await this.roleRepository.findById(user.roleId);
    if (!role) throw AppError.internal('INTERNAL', { reason: 'ROLE_NOT_FOUND', roleId: user.roleId });

    const profile = await this.employeeProfileRepository.findByUserId(userId);

    return toUserSummary(user, role.name, profile);
  }
}
