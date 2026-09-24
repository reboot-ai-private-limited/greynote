import { AppError } from '@/shared/errors/AppError.js';
import type { RefreshTokenGeneratorPort } from '../../domain/refreshTokenGenerator.port.js';
import type { UserSessionRepositoryPort } from '../../domain/userSession.repository.port.js';

export class LogoutUseCase {
  constructor(
    private readonly userSessionRepository: UserSessionRepositoryPort,
    private readonly refreshTokenGenerator: RefreshTokenGeneratorPort,
  ) {}

  /** Scoped to the authenticated caller's own session — one user's refresh token can never revoke another's. */
  async execute(callerUserId: string, refreshToken: string): Promise<void> {
    const hash = this.refreshTokenGenerator.hash(refreshToken);
    const session = await this.userSessionRepository.findByRefreshTokenHash(hash);
    // Already gone or never existed — logout is idempotent, this is the goal state either way.
    if (!session) return;

    if (session.userId !== callerUserId) throw AppError.forbidden();

    await this.userSessionRepository.revoke(session.id, 'LOGOUT');
  }
}
