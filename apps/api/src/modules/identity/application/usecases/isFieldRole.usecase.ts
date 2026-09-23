import { AppError } from '@/shared/errors/AppError.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';

export class IsFieldRoleUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly roleRepository: RoleRepositoryPort,
  ) {}

  async execute(userId: string): Promise<boolean> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw AppError.notFound();

    const role = await this.roleRepository.findById(user.roleId);
    if (!role) throw AppError.internal('INTERNAL', { reason: 'ROLE_NOT_FOUND', roleId: user.roleId });

    return role.name === 'FIELD';
  }
}
