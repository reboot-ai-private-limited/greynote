import { AppError } from '@/shared/errors/AppError.js';
import type { AccessTokenSignerPort } from '../../domain/accessTokenSigner.port.js';
import type { RefreshTokenGeneratorPort } from '../../domain/refreshTokenGenerator.port.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import type { UserSessionRepositoryPort } from '../../domain/userSession.repository.port.js';

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
      // Reuse of an already-rotated token is a theft signal — revoke EVERYTHING for this user,
      // including the device currently, legitimately, mid-use. Intended trade-off (hld/04 §1).
      await this.userSessionRepository.revokeAllForUser(session.userId);
      throw AppError.unauthenticated('Session invalidated, please log in again.');
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      // Natural expiry, not theft — no revoke-all, just ask for a fresh login.
      throw AppError.unauthenticated();
    }

    const user = await this.userRepository.findById(session.userId);
    if (!user) throw AppError.internal('INTERNAL', { reason: 'SESSION_USER_NOT_FOUND', userId: session.userId });
    const role = await this.roleRepository.findById(user.roleId);
    if (!role) throw AppError.internal('INTERNAL', { reason: 'ROLE_NOT_FOUND', roleId: user.roleId });

    await this.userSessionRepository.revoke(session.id);

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
      revokedAt: null,
    });

    const accessToken = this.accessTokenSigner.sign({
      sub: user.id,
      role: role.name,
      employeeCode: user.employeeCode,
    });

    return { accessToken, refreshToken: newRefreshToken, expiresIn: this.opts.accessTokenTtlSeconds };
  }
}
