import { AppError } from '@/shared/errors/AppError.js';
import type { AccessTokenSignerPort } from '../../domain/accessTokenSigner.port.js';
import type { ConfigProviderPort } from '../../domain/configProvider.port.js';
import type { PasswordHasherPort } from '../../domain/passwordHasher.port.js';
import type { RefreshTokenGeneratorPort } from '../../domain/refreshTokenGenerator.port.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';
import { toUserSummary, type User, type UserSummary } from '../../domain/user.entity.js';
import type { UserDeviceRepositoryPort } from '../../domain/userDevice.repository.port.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import type { Platform } from '../../domain/userSession.entity.js';
import type { UserSessionRepositoryPort } from '../../domain/userSession.repository.port.js';

/** Shown on sign-in and refresh for an account that has been deactivated (offboarded). */
export const DEACTIVATED_MESSAGE = 'This account has been deactivated. Contact your administrator.';

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

/** Shown when a field employee signs in on the web portal, which is for Admin, HR and Accountant only. */
export const WEB_NOT_FOR_FIELD_MESSAGE = 'The web portal is for office staff. Please use the mobile app.';

/** Sent in `publicDetails.reason` so the app can show the right screen, not a generic error. */
export type DeviceBlockReason = 'DEVICE_APPROVAL_PENDING' | 'DEVICE_REJECTED' | 'DEVICE_LIMIT_REACHED';

export class LoginUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly roleRepository: RoleRepositoryPort,
    private readonly userSessionRepository: UserSessionRepositoryPort,
    private readonly userDeviceRepository: UserDeviceRepositoryPort,
    private readonly passwordHasher: PasswordHasherPort,
    private readonly accessTokenSigner: AccessTokenSignerPort,
    private readonly refreshTokenGenerator: RefreshTokenGeneratorPort,
    private readonly configProvider: ConfigProviderPort,
    private readonly opts: { accessTokenTtlSeconds: number; refreshTokenTtlDays: number },
  ) {}

  async execute(input: LoginInput, ctx: { viaWeb?: boolean } = {}): Promise<LoginOutput> {
    const user = await this.userRepository.findByEmployeeCode(input.employeeCode);
    // Same message whether the employee code or the password was wrong — never reveal which.
    const invalidCredentials = () => AppError.unauthenticated('Invalid employee code or password.');
    if (!user) throw invalidCredentials();

    const passwordValid = await this.passwordHasher.verify(input.password, user.passwordHash);
    if (!passwordValid) throw invalidCredentials();

    // Only after the password check, so the account's existence is not revealed to a guesser; and
    // before the device registry, so a deactivated employee's phone never creates a request.
    if (user.status === 'inactive') throw AppError.forbidden(DEACTIVATED_MESSAGE);

    const role = await this.roleRepository.findById(user.roleId);
    if (!role) throw AppError.internal('INTERNAL', { reason: 'ROLE_NOT_FOUND', roleId: user.roleId });

    // After the password check, like the deactivated message: the account's existence is not revealed to a guesser.
    if (ctx.viaWeb && role.name === 'FIELD') throw AppError.forbidden(WEB_NOT_FOR_FIELD_MESSAGE);

    // A blocked user's login still succeeds — the compliance block gates future submissions
    // (hld/10), not authentication. Flagged in docs/LLD/identity.md as needing confirmation.

    // Only after the password check, so only a real employee can ever create a device request.
    // The Play reviewers' demo account skips it: nobody can approve their phone, and it only ever holds demo data.
    if (role.name === 'FIELD' && !user.isDemo) await this.assertDeviceAllowed(user, input);
    // Web-portal roles (ADMIN/HR/ACCOUNTANT) have no device registry or limit.

    const existingSession = await this.userSessionRepository.findActiveByDeviceId(user.id, input.deviceId);
    if (existingSession) await this.userSessionRepository.revoke(existingSession.id, 'ROTATED');

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

  /** hld/04 §2: every new phone needs Admin approval; at the limit no request is created. */
  private async assertDeviceAllowed(user: User, input: LoginInput): Promise<void> {
    const device = await this.userDeviceRepository.findLive(user.id, input.deviceId);

    if (device?.status === 'REGISTERED') return;
    if (device?.status === 'PENDING') {
      throw deviceBlocked(409, 'DEVICE_APPROVAL_PENDING', 'Waiting for Admin to approve this device.');
    }
    if (device?.status === 'REJECTED') {
      const until = device.expiresAt ? ` You can request again after ${device.expiresAt.toISOString().slice(0, 10)}.` : '';
      throw deviceBlocked(403, 'DEVICE_REJECTED', `Admin rejected this device.${until}`, {
        retryAfter: device.expiresAt,
      });
    }

    const limit = Number(await this.configProvider.get('MAX_REGISTERED_DEVICES_FIELD'));
    if ((await this.userDeviceRepository.countSlotsUsed(user.id)) >= limit) {
      throw deviceBlocked(
        409,
        'DEVICE_LIMIT_REACHED',
        `You already have ${limit} devices. Ask Admin to remove an old device first.`,
        { limit },
      );
    }

    await this.userDeviceRepository.createPending({
      userId: user.id,
      deviceId: input.deviceId,
      deviceName: input.deviceName,
      deviceModel: input.deviceModel,
      platform: input.platform,
    });
    throw deviceBlocked(409, 'DEVICE_APPROVAL_PENDING', 'Request sent. Waiting for Admin to approve this device.');
  }
}

function deviceBlocked(
  statusCode: 403 | 409,
  reason: DeviceBlockReason,
  message: string,
  extra: Record<string, unknown> = {},
): AppError {
  return new AppError({
    statusCode,
    code: statusCode === 403 ? 'FORBIDDEN' : 'CONFLICT',
    message,
    publicDetails: { reason, ...extra },
  });
}
