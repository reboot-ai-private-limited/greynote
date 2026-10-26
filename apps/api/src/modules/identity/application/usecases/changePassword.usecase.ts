import { AppError } from '@/shared/errors/AppError.js';
import type { PasswordHasherPort } from '../../domain/passwordHasher.port.js';
import type { RefreshTokenGeneratorPort } from '../../domain/refreshTokenGenerator.port.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import type { UserSessionRepositoryPort } from '../../domain/userSession.repository.port.js';

/**
 * Any signed-in employee changing their own password. The current password is asked again so a borrowed
 * phone or an open browser can't do it. Every other session ends; the one the request came from (found by its
 * refresh token, as in logout) stays. Without a recognisable refresh token every session ends, which is the safe side.
 */
export class ChangePasswordUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly userSessionRepository: UserSessionRepositoryPort,
    private readonly passwordHasher: PasswordHasherPort,
    private readonly refreshTokenGenerator: RefreshTokenGeneratorPort,
  ) {}

  async execute(userId: string, currentPassword: string, newPassword: string, refreshToken?: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw AppError.notFound();
    if (!(await this.passwordHasher.verify(currentPassword, user.passwordHash))) {
      throw AppError.forbidden('The current password is not correct.');
    }
    if (currentPassword === newPassword) {
      throw AppError.badRequest('The new password must be different from the current one.', { field: 'newPassword' });
    }

    await this.userRepository.update(userId, { passwordHash: await this.passwordHasher.hash(newPassword) });

    const current = refreshToken
      ? await this.userSessionRepository.findByRefreshTokenHash(this.refreshTokenGenerator.hash(refreshToken))
      : null;
    const keep = current && current.userId === userId && !current.revokedAt ? current.id : null;
    await this.userSessionRepository.revokeOthersForUser(userId, keep, 'PASSWORD_RESET');
  }
}
