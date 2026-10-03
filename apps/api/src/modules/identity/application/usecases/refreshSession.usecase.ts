import { AppError } from '@/shared/errors/AppError.js';
import type { AccessTokenSignerPort } from '../../domain/accessTokenSigner.port.js';
import type { RefreshTokenGeneratorPort } from '../../domain/refreshTokenGenerator.port.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import type { UserSessionRepositoryPort } from '../../domain/userSession.repository.port.js';
import { DEACTIVATED_MESSAGE } from './login.usecase.js';

export interface RefreshSessionOutput {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class RefreshSessionUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly roleRepository: RoleRepositoryPort,
    private readonly userSessionRepository: UserSessionRepositoryPort,
    private readonly accessTokenSigner: AccessTokenSignerPort,
    private readonly refreshTokenGenerator: RefreshTokenGeneratorPort,
    private readonly opts: { accessTokenTtlSeconds: number; refreshTokenTtlDays: number },
  ) {}

  async execute(refreshToken: string): Promise<RefreshSessionOutput> {
    const hash = this.refreshTokenGenerator.hash(refreshToken);
    const session = await this.userSessionRepository.findByRefreshTokenHash(hash);
    if (!session) throw AppError.unauthenticated();

    if (session.revokedAt) {
      if (session.revokedReason === 'ROTATED') {
        // Reuse of an already-rotated token is a theft signal — revoke EVERYTHING for this user,
        // including the device currently, legitimately, mid-use. Intended trade-off (hld/04 §1).
        await this.userSessionRepository.revokeAllForUser(session.userId, 'THEFT');
        throw AppError.unauthenticated('Session invalidated, please log in again.');
      }
      // Logged out, removed by Admin, or password reset: just dead, not theft.
      throw AppError.unauthenticated('Please log in again.');
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      // Natural expiry, not theft — no revoke-all, just ask for a fresh login.
      throw AppError.unauthenticated();
    }

    const user = await this.userRepository.findById(session.userId);
    if (!user) throw AppError.internal('INTERNAL', { reason: 'SESSION_USER_NOT_FOUND', userId: session.userId });
    if (user.status === 'inactive') {
      // Deactivation ends sessions when it happens; this catches any that slipped through (an
      // account deactivated before that was added) and stops the refresh chain for good.
      await this.userSessionRepository.revokeAllForUser(user.id, 'ADMIN');
      throw AppError.unauthenticated(DEACTIVATED_MESSAGE);
    }
    const role = await this.roleRepository.findById(user.roleId);
    if (!role) throw AppError.internal('INTERNAL', { reason: 'ROLE_NOT_FOUND', roleId: user.roleId });

    await this.userSessionRepository.revoke(session.id, 'ROTATED');

    const newRefreshToken = this.refreshTokenGenerator.generate();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.opts.refreshTokenTtlDays * 24 * 60 * 60 * 1000);

    await this.userSessionRepository.create({
      userId: user.id,
      deviceId: session.deviceId,
      deviceName: session.deviceName,
      deviceModel: session.deviceModel,
      platform: session.platform,
      refreshTokenHash: this.refreshTokenGenerator.hash(newRefreshToken),
      issuedAt: now,
      expiresAt,
      lastActiveAt: now,
    });

    const accessToken = this.accessTokenSigner.sign({
      sub: user.id,
      role: role.name,
      employeeCode: user.employeeCode,
    });

    return { accessToken, refreshToken: newRefreshToken, expiresIn: this.opts.accessTokenTtlSeconds };
  }
}
