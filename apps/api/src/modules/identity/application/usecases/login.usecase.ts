import { AppError } from '@/shared/errors/AppError.js';
import type { AccessTokenSignerPort } from '../../domain/accessTokenSigner.port.js';
import type { ConfigProviderPort } from '../../domain/configProvider.port.js';
import type { PasswordHasherPort } from '../../domain/passwordHasher.port.js';
import type { RefreshTokenGeneratorPort } from '../../domain/refreshTokenGenerator.port.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';
import { toUserSummary, type UserSummary } from '../../domain/user.entity.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import type { Platform } from '../../domain/userSession.entity.js';
import type { UserSessionRepositoryPort } from '../../domain/userSession.repository.port.js';

export interface LoginInput {
  employeeCode: string;
  password: string;
  deviceId: string;
  deviceName: string;
  deviceModel: string;
  platform: Platform;
}

export interface LoginOutput {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: UserSummary;
}

export class LoginUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly roleRepository: RoleRepositoryPort,
    private readonly userSessionRepository: UserSessionRepositoryPort,
    private readonly passwordHasher: PasswordHasherPort,
    private readonly accessTokenSigner: AccessTokenSignerPort,
    private readonly refreshTokenGenerator: RefreshTokenGeneratorPort,
    private readonly configProvider: ConfigProviderPort,
    private readonly opts: { accessTokenTtlSeconds: number; refreshTokenTtlDays: number },
  ) {}

  async execute(input: LoginInput): Promise<LoginOutput> {
    const user = await this.userRepository.findByEmployeeCode(input.employeeCode);
    // Same message whether the employee code or the password was wrong — never reveal which.
    const invalidCredentials = () => AppError.unauthenticated('Invalid employee code or password.');
    if (!user) throw invalidCredentials();

    const passwordValid = await this.passwordHasher.verify(input.password, user.passwordHash);
    if (!passwordValid) throw invalidCredentials();

    const role = await this.roleRepository.findById(user.roleId);
    if (!role) throw AppError.internal('INTERNAL', { reason: 'ROLE_NOT_FOUND', roleId: user.roleId });

    // A blocked user's login still succeeds — the compliance block gates future submissions
    // (hld/10), not authentication. Flagged in docs/LLD/identity.md as needing confirmation.

    if (role.name === 'FIELD') {
      const existingSession = await this.userSessionRepository.findActiveByDeviceId(
        user.id,
        input.deviceId,
      );
      if (existingSession) {
        // Re-login on an already-active device: replace, doesn't count against the limit.
        await this.userSessionRepository.revoke(existingSession.id);
      } else {
        const limit = Number(await this.configProvider.get('MAX_ACTIVE_DEVICES_FIELD'));
        const activeCount = await this.userSessionRepository.countActive(user.id);
        if (activeCount >= limit) {
          throw AppError.conflict('Log out from another device first.');
        }
      }
    }
    // Web-portal roles (ADMIN/HR/ACCOUNTANT) have no device limit — this branch doesn't run.

    const refreshToken = this.refreshTokenGenerator.generate();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.opts.refreshTokenTtlDays * 24 * 60 * 60 * 1000);

    await this.userSessionRepository.create({
      userId: user.id,
      deviceId: input.deviceId,
      deviceName: input.deviceName,
      deviceModel: input.deviceModel,
      platform: input.platform,
      refreshTokenHash: this.refreshTokenGenerator.hash(refreshToken),
      issuedAt: now,
      expiresAt,
      lastActiveAt: now,
      revokedAt: null,
    });

    await this.userRepository.update(user.id, { lastLoginAt: now });

    const accessToken = this.accessTokenSigner.sign({
      sub: user.id,
      role: role.name,
      employeeCode: user.employeeCode,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.opts.accessTokenTtlSeconds,
      user: toUserSummary(user, role.name),
    };
  }
}
