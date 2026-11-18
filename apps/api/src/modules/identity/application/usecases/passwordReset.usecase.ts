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
/** A person may ask for a new code once a minute, and at most this many in 24 hours. */
export const RESEND_WAIT_SECONDS = 60;
export const MAX_CODES_PER_DAY = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

const INVALID_CODE = 'That code is not valid or has expired. Ask for a new one.';

interface Deps {
  users: UserRepositoryPort;
  roles: RoleRepositoryPort;
  requests: PasswordResetRequestRepositoryPort;
  hasher: PasswordHasherPort;
  mailer: MailerPort;
  /** The owner's address (`PASSWORD_RESET_OWNER_EMAIL`): where an Admin's code goes when the Admin has no email of their own. */
  ownerEmail: string | undefined;
  /** In development, when no mail server is set up, the code is written to the log so the flow can be tried. Never in production. */
  logCodeWhenMailMissing?: boolean;
  now?: () => Date;
}

/** What asking for a code answers. A code was (or, if the ID is not one we know, was not) sent; or the account has no email and the person must contact an Admin. */
export type ResetRequestResult =
  | { delivery: 'EMAIL' }
  | { delivery: 'NO_EMAIL'; admin: { name: string; email: string } | null };

const MAIL_NOT_CONFIGURED = (err: unknown) => err instanceof AppError && (err.details as { reason?: string } | undefined)?.reason === 'MAIL_NOT_CONFIGURED';

/** The first active Admin with an email: who a person with no email of their own is told to contact. */
async function adminContact(deps: Pick<Deps, 'users' | 'roles'>): Promise<{ name: string; email: string } | null> {
  const role = await deps.roles.findByName('ADMIN');
  if (!role) return null;
  const admin = (await deps.users.listActive()).find((u) => u.roleId === role.id && u.email && !u.isDemo);
  return admin ? { name: admin.name, email: admin.email! } : null;
}

/**
 * Anyone who forgot their password asks for a code (decision-log 2026-11-18). It is emailed to the address in their own details. Someone with no email gets
 * "contact your Admin" with an Admin's contact; an Admin with no email of their own is sent to the owner's address as before. An ID we do not know, or an inactive
 * account, gets the same answer as a sent code and nothing is sent. A person may ask once a minute and five times a day, so nobody can be flooded.
 */
export class RequestPasswordResetUseCase {
  private readonly now: () => Date;

  constructor(private readonly deps: Deps) {
    this.now = deps.now ?? (() => new Date());
  }

  async execute(employeeCode: string): Promise<ResetRequestResult> {
    const { users, roles, requests, hasher, mailer, ownerEmail } = this.deps;
    const sentAnswer: ResetRequestResult = { delivery: 'EMAIL' };
    const user = await users.findByEmployeeCode(employeeCode);
    if (!user || user.status !== 'active') return sentAnswer;

    const isAdmin = (await roles.findById(user.roleId))?.name === 'ADMIN';
    const to = user.email ?? (isAdmin ? ownerEmail : undefined);
    if (!to) return { delivery: 'NO_EMAIL', admin: await adminContact(this.deps) };

    const now = this.now();
    const last = await requests.latestCreatedAtForUser(user.id);
    if (last && now.getTime() - last.getTime() < RESEND_WAIT_SECONDS * 1000) return sentAnswer;
    if ((await requests.countForUserSince(user.id, new Date(now.getTime() - DAY_MS))) >= MAX_CODES_PER_DAY) {
      logger.warn({ reason: 'PASSWORD_RESET_DAILY_LIMIT_REACHED', userId: user.id }, 'Password reset not sent: this person reached the daily limit.');
      return sentAnswer;
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await requests.closeOpenForUser(user.id, now);
    const request = await requests.create({ userId: user.id, otpHash: await hasher.hash(code), expiresAt: new Date(now.getTime() + OTP_TTL_MINUTES * 60_000), attempts: 0, usedAt: null, createdAt: now });

    const forOwner = !user.email;
    try {
      await mailer.send({
        to,
        subject: forOwner ? `Greynote: password reset code for ${user.employeeCode}` : 'Greynote: your password reset code',
        text: forOwner
          ? `${user.name} (${user.employeeCode}) asked to reset their Admin password.\n\nCode: ${code}\n\nIt works once and expires in ${OTP_TTL_MINUTES} minutes. Give it to ${user.name} only if you expect this request. If you do not, ignore this email and nothing changes.`
          : `Hello ${user.name},\n\nYour Greynote password reset code is ${code}\n\nIt works once and expires in ${OTP_TTL_MINUTES} minutes. If you did not ask for it, ignore this email: your password stays as it is.`,
      });
    } catch (err) {
      if (this.deps.logCodeWhenMailMissing && MAIL_NOT_CONFIGURED(err)) {
        // Development only: no mail server, so the code goes to the log (and the request is kept) to let the flow be tried.
        logger.warn({ employeeCode: user.employeeCode, code }, 'No mail server is set up: the password reset code is logged for development.');
        return sentAnswer;
      }
      // Not counted against the person's limit: they never got a code.
      await requests.delete(request.id);
      logger.error({ err, reason: 'PASSWORD_RESET_MAIL_FAILED' }, 'A password reset code could not be emailed.');
    }
    return sentAnswer;
  }
}

/** The person brings the code and a new password. Every failure reads the same; the new password ends every session. */
export class ConfirmPasswordResetUseCase {
  private readonly now: () => Date;

  constructor(private readonly deps: Deps & { sessions: UserSessionRepositoryPort }) {
    this.now = deps.now ?? (() => new Date());
  }

  async execute(input: { employeeCode: string; otp: string; newPassword: string }): Promise<void> {
    const { users, requests, hasher, sessions, mailer, ownerEmail } = this.deps;
    const invalid = () => AppError.badRequest(INVALID_CODE, { field: 'otp' });

    const user: User | null = await users.findByEmployeeCode(input.employeeCode);
    if (!user || user.status !== 'active') throw invalid();
    const now = this.now();
    const request = await requests.findOpenForUser(user.id, now);
    if (!request || request.attempts >= MAX_WRONG_CODES) throw invalid();

    if (!(await hasher.verify(input.otp, request.otpHash))) {
      await requests.addAttempt(request.id);
      throw invalid();
    }
    // Claimed before anything changes, so two requests with the right code cannot both succeed.
    if (!(await requests.markUsed(request.id, now))) throw invalid();

    await users.update(user.id, { passwordHash: await hasher.hash(input.newPassword) });
    await sessions.revokeAllForUser(user.id, 'PASSWORD_RESET');
    logger.info({ userId: user.id, reason: 'PASSWORD_RESET' }, 'Password reset with an emailed code.');

    const notify = user.email ?? ownerEmail;
    if (notify) {
      await mailer
        .send({
          to: notify,
          subject: user.email ? 'Greynote: your password was changed' : `Greynote: password was reset for ${user.employeeCode}`,
          text: user.email
            ? `Hello ${user.name},\n\nYour Greynote password was just changed with a reset code, and you were signed out everywhere. If this was not you, contact your Admin straight away.`
            : `${user.name} (${user.employeeCode}) reset their Admin password using a code. All their sessions were signed out. If this was not expected, reset the password from another Admin account.`,
        })
        .catch((err: unknown) => logger.error({ err }, 'Could not email that a password was reset.'));
    }
  }
}
