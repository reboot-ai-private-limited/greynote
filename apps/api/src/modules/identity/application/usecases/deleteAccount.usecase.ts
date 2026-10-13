import { randomBytes } from 'node:crypto';
import { AppError } from '@/shared/errors/AppError.js';
import type { DocumentStoragePort } from '../../domain/documentStorage.port.js';
import type { EmployeeProfileRepositoryPort } from '../../domain/employeeProfile.repository.port.js';
import type { PasswordHasherPort } from '../../domain/passwordHasher.port.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import type { UserDeviceRepositoryPort } from '../../domain/userDevice.repository.port.js';
import type { UserSessionRepositoryPort } from '../../domain/userSession.repository.port.js';

export const DELETED_NAME = 'Deleted user';

/**
 * Account deletion (Google Play requires it in the app). Personal data is scrubbed and the account
 * is closed, but the employee code and every record that points at it — payroll, calls, DCRs,
 * expenses, approvals — stay, under the name "Deleted user": they are statutory/audit records.
 * Org data on the profile (designation, pay band, manager, HQ, joining date) stays for the same
 * reason. FIELD employees only; ADMIN/HR/ACCOUNTANT are offboarded by an Admin, which keeps the
 * system from losing its last Admin.
 */
export class DeleteAccountUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly roleRepository: RoleRepositoryPort,
    private readonly employeeProfileRepository: EmployeeProfileRepositoryPort,
    private readonly userSessionRepository: UserSessionRepositoryPort,
    private readonly userDeviceRepository: UserDeviceRepositoryPort,
    private readonly passwordHasher: PasswordHasherPort,
    private readonly documentStorage: DocumentStoragePort,
  ) {}

  /** The employee deleting their own account; the password is asked again so a stolen phone can't do it. */
  async deleteOwn(userId: string, password: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw AppError.notFound();
    if (!(await this.passwordHasher.verify(password, user.passwordHash))) {
      throw AppError.forbidden('The password is not correct.');
    }
    await this.run(userId);
  }

  /**
   * The public deletion page on the company website (Google Play's account-deletion URL): no session,
   * so the employee code and password are the proof. Same message for a wrong code and a wrong password.
   */
  async deleteByCredentials(employeeCode: string, password: string): Promise<void> {
    const invalid = () => AppError.unauthenticated('Invalid employee code or password.');
    const user = await this.userRepository.findByEmployeeCode(employeeCode);
    if (!user) {
      // Spend the same time as a real check so response time doesn't reveal which codes exist.
      await this.passwordHasher.verify(password, await this.dummyHash());
      throw invalid();
    }
    if (!(await this.passwordHasher.verify(password, user.passwordHash))) throw invalid();
    await this.run(user.id);
  }

  private dummyHashPromise?: Promise<string>;
  private dummyHash(): Promise<string> {
    this.dummyHashPromise ??= this.passwordHasher.hash(randomBytes(16).toString('hex'));
    return this.dummyHashPromise;
  }

  /** Admin/HR doing it on an employee's written request. */
  async anonymise(userId: string): Promise<void> {
    await this.run(userId);
  }

  private async run(userId: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw AppError.notFound();
    if (user.isDemo) throw AppError.forbidden('The demo account cannot be deleted.');
    if (user.deletedAt) throw AppError.conflict('This account has already been deleted.');

    const role = await this.roleRepository.findById(user.roleId);
    if (role?.name !== 'FIELD') {
      throw AppError.badRequest('Only field employee accounts can be deleted here. Deactivate other accounts instead.');
    }

    // A manager with active reports can't vanish: approvals would have nobody to route to.
    const reports = await this.employeeProfileRepository.findDownline(userId);
    const direct = reports.filter((r) => r.depth === 1).map((r) => r.userId);
    const active = (await this.userRepository.findByIds(direct)).filter((u) => u.status !== 'inactive');
    if (active.length > 0) {
      throw AppError.conflict('Reassign this manager’s team before deleting the account.', {
        reason: 'HAS_ACTIVE_REPORTS',
        count: active.length,
      });
    }

    // Files first: if storage fails the DB still lists them and the request can simply be retried.
    const profile = await this.employeeProfileRepository.findByUserId(userId);
    for (const document of profile?.documents ?? []) await this.documentStorage.remove(document.publicId);
    if (profile) {
      await this.employeeProfileRepository.upsert(userId, {
        mobileNumber: null,
        alternateMobile: null,
        guardianName: null,
        dateOfBirth: null,
        address: null,
        permanentAddress: null,
        permanentSameAsPresent: false,
        qualification: null,
        qualifications: [],
        previousEmployment: [],
        esiNumber: null,
        bankDetails: null,
        documents: [],
      });
    }

    // Closing the account first would be enough to stop sign-in; the sessions and devices follow.
    const passwordHash = await this.passwordHasher.hash(randomBytes(32).toString('hex'));
    await this.userRepository.update(userId, {
      status: 'inactive',
      name: DELETED_NAME,
      email: null,
      phone: null,
      passwordHash,
      deletedAt: new Date(),
    });
    await this.userSessionRepository.revokeAllForUser(userId, 'ADMIN');
    for (const device of await this.userDeviceRepository.listForUser(userId)) {
      if (device.status === 'PENDING' || device.status === 'REGISTERED') {
        await this.userDeviceRepository.setStatus(device.id, { status: 'REMOVED', decidedBy: userId });
      }
    }
  }
}
