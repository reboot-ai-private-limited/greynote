import { randomInt } from 'node:crypto';
import { AppError } from '@/shared/errors/AppError.js';
import { logger } from '@/shared/logging/logger.js';
import type { MailerPort } from '@/shared/mail/mailer.port.js';
import type { PasswordHasherPort } from '../../domain/passwordHasher.port.js';
import type { PasswordResetRequestRepositoryPort } from '../../domain/passwordResetRequest.repository.port.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';
import type { User } from '../../domain/user.entity.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import type { UserSessionRepositoryPort } from '../../domain/userSession.repository.port.js';

export const OTP_TTL_MINUTES = 10;
export const MAX_WRONG_CODES = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

const INVALID_CODE = 'That code is not valid or has expired. Ask for a new one.';

interface Deps {
  users: UserRepositoryPort;
  roles: RoleRepositoryPort;
  requests: PasswordResetRequestRepositoryPort;
  hasher: PasswordHasherPort;
  mailer: MailerPort;
  /** The owner's address (`PASSWORD_RESET_OWNER_EMAIL` in the environment); undefined = the feature is off. */
  ownerEmail: string | undefined;
  /** `PASSWORD_RESET_DAILY_LIMIT` in the environment. */
  dailyLimit: number;
  now?: () => Date;
}

/** An active Admin account, or null: nobody else may use this door, and the caller cannot tell which it was. */
async function activeAdmin(deps: Pick<Deps, 'users' | 'roles'>, employeeCode: string): Promise<User | null> {
  const user = await deps.users.findByEmployeeCode(employeeCode);
  if (!user || user.status !== 'active') return null;
  const role = await deps.roles.findById(user.roleId);
  return role?.name === 'ADMIN' ? user : null;
}

/**
 * An Admin who forgot their password asks for a code. It goes to the owner's address from the environment, never to the requester, and only
 * when the employee ID is an active Admin: any other ID does nothing at all (no code, no email, nothing counted) and gets the same
 * answer. At most `PASSWORD_RESET_DAILY_LIMIT` (environment) codes are sent in any 24 hours, for the whole system.
 */
export class RequestAdminPasswordResetUseCase {
  private readonly now: () => Date;

  constructor(private readonly deps: Deps) {
    this.now = deps.now ?? (() => new Date());
  }

  async execute(employeeCode: string): Promise<void> {
    const { requests, hasher, mailer, ownerEmail, dailyLimit } = this.deps;
    const admin = await activeAdmin(this.deps, employeeCode);
    if (!admin) return;

    if (!ownerEmail) {
      logger.error({ reason: 'PASSWORD_RESET_OWNER_EMAIL_NOT_SET' }, 'Admin password reset asked for, but PASSWORD_RESET_OWNER_EMAIL is not set.');
      return;
    }

    const now = this.now();
    if ((await requests.countCreatedSince(new Date(now.getTime() - DAY_MS))) >= dailyLimit) {
      logger.warn({ reason: 'PASSWORD_RESET_DAILY_LIMIT_REACHED', limit: dailyLimit }, 'Admin password reset not sent: daily limit reached.');
      return;
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await requests.closeOpenForUser(admin.id, now);
    const request = await requests.create({
      userId: admin.id,
      otpHash: await hasher.hash(code),
      expiresAt: new Date(now.getTime() + OTP_TTL_MINUTES * 60_000),
      attempts: 0,
      usedAt: null,
      createdAt: now,
    });

    try {
      await mailer.send({
        to: ownerEmail,
        subject: `Greynote: password reset code for ${admin.employeeCode}`,
        text: `${admin.name} (${admin.employeeCode}) asked to reset their Admin password.\n\nCode: ${code}\n\nIt works once and expires in ${OTP_TTL_MINUTES} minutes. Give it to ${admin.name} only if you expect this request. If you do not, ignore this email and nothing changes.`,
      });
    } catch (err) {
      // Not counted against the cap: the owner never got a code.
      await requests.delete(request.id);
      logger.error({ err, reason: 'PASSWORD_RESET_MAIL_FAILED' }, 'Admin password reset code could not be emailed.');
    }
  }
}

/** The Admin brings the code and a new password. Every failure reads the same; the new password ends every session. */
export class ConfirmAdminPasswordResetUseCase {
  private readonly now: () => Date;

  constructor(
    private readonly deps: Deps & { sessions: UserSessionRepositoryPort },
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  async execute(input: { employeeCode: string; otp: string; newPassword: string }): Promise<void> {
    const { users, requests, hasher, sessions, mailer, ownerEmail } = this.deps;
    const invalid = () => AppError.badRequest(INVALID_CODE, { field: 'otp' });

    const admin = await activeAdmin(this.deps, input.employeeCode);
    if (!admin) throw invalid();
    const now = this.now();
    const request = await requests.findOpenForUser(admin.id, now);
    if (!request || request.attempts >= MAX_WRONG_CODES) throw invalid();

    if (!(await hasher.verify(input.otp, request.otpHash))) {
      await requests.addAttempt(request.id);
      throw invalid();
    }
    // Claimed before anything changes, so two requests with the right code cannot both succeed.
    if (!(await requests.markUsed(request.id, now))) throw invalid();

    await users.update(admin.id, { passwordHash: await hasher.hash(input.newPassword) });
    await sessions.revokeAllForUser(admin.id, 'PASSWORD_RESET');
    logger.info({ userId: admin.id, reason: 'ADMIN_PASSWORD_RESET' }, 'Admin password reset with an emailed code.');

    if (ownerEmail) {
      await mailer
        .send({
          to: ownerEmail,
          subject: `Greynote: password was reset for ${admin.employeeCode}`,
          text: `${admin.name} (${admin.employeeCode}) reset their Admin password using a code. All their sessions were signed out. If this was not expected, reset the password from another Admin account.`,
        })
        .catch((err: unknown) => logger.error({ err }, 'Could not email the owner that an Admin password was reset.'));
    }
  }
}
