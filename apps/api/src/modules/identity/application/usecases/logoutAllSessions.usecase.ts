import { AppError } from '@/shared/errors/AppError.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import type { UserSessionRepositoryPort } from '../../domain/userSession.repository.port.js';

/** Admin-only — revokes every session for a target user. Offboarding, not a self-service action. */
export class LogoutAllSessionsUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly userSessionRepository: UserSessionRepositoryPort,
  ) {}

  async execute(targetUserId: string): Promise<void> {
    const user = await this.userRepository.findById(targetUserId);
    if (!user) throw AppError.notFound();

    await this.userSessionRepository.revokeAllForUser(targetUserId);
  }
}
