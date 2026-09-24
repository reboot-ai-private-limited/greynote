import { AppError } from '@/shared/errors/AppError.js';
import type { PasswordHasherPort } from '../../domain/passwordHasher.port.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import type { UserSessionRepositoryPort } from '../../domain/userSession.repository.port.js';

/** Admin-only (client sign-off A5). Every existing session ends; registered devices stay registered. */
export class ResetPasswordUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly userSessionRepository: UserSessionRepositoryPort,
    private readonly passwordHasher: PasswordHasherPort,
  ) {}

  async execute(userId: string, newPassword: string): Promise<void> {
    if (!(await this.userRepository.findById(userId))) throw AppError.notFound();
    const passwordHash = await this.passwordHasher.hash(newPassword);
    await this.userRepository.update(userId, { passwordHash });
    await this.userSessionRepository.revokeAllForUser(userId, 'PASSWORD_RESET');
  }
}
