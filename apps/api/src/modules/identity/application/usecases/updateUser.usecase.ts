import { AppError } from '@/shared/errors/AppError.js';
import { computeUserStatus } from '../../domain/onboarding.js';
import type { Address, BankDetails, EmployeeProfile, PreviousEmployment, Qualification } from '../../domain/employeeProfile.entity.js';
import type { EmployeeProfileRepositoryPort } from '../../domain/employeeProfile.repository.port.js';
import type { ManagerHistoryRepositoryPort } from '../../domain/managerHistory.repository.port.js';
import type { DesignationRepositoryPort } from '../../domain/designation.repository.port.js';
import type { PayBandRepositoryPort } from '../../domain/payBand.repository.port.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';
import { ManagerRules } from './managerRules.js';
import type { User, UserSummary } from '../../domain/user.entity.js';
import { toUserSummary } from '../../domain/user.entity.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';

/**
 * Every section optional — this is the incremental-onboarding PATCH (decision 13), and now the
 * ONLY place `designationId`/`payBandId`/`managerId`/`dateOfJoining` ever get set (they moved off
 * `User` onto `EmployeeProfile` and are no longer accepted at creation). Each call fills in one
 * section (a *complete* `address`/`bankDetails` object, not field-by-field), and `status` is
 * recomputed from the merged result after applying whichever sections were sent.
 * `guardianName`, `qualification` and `dateOfJoining` are the optional fields, so `null` clears them
 * (a missing key leaves them alone); everything `computeUserStatus` needs can be changed but not
 * cleared, since clearing one would silently demote an active employee to `pending`.
 * A manager is refused if it would make an employee report to themselves, directly or through
 * the chain — the approval routing walks that chain upward and must reach the top.
 * Deactivating is not an edit (decision-log 2026-10-22): it is `DeactivateEmployeeUseCase`, which also hands the team and the work
 * over. An `inactive` account stays inactive here: `computeUserStatus` never upgrades it as a side effect of a later edit.
 */
export interface UpdateUserInput {
  basicDetails?: {
    name?: string;
    mobileNumber?: string;
    alternateMobile?: string | null;
    guardianName?: string | null;
    dateOfBirth?: Date;
    dateOfJoining?: Date | null;
    onProbation?: boolean;
    probationMonths?: number | null;
    esiNumber?: string | null;
    epfNumber?: string | null;
    qualification?: string | null;
    address?: Address;
    permanentAddress?: Address;
    permanentSameAsPresent?: boolean;
    qualifications?: Qualification[];
    previousEmployment?: PreviousEmployment[];
  };
  bankDetails?: BankDetails;
  designationId?: string;
  payBandId?: string;
  managerId?: string;
}

/** An incoming value wins, even `null` (a clear); only a missing key keeps what is stored. */
function pick<T>(incoming: T | null | undefined, stored: T | null | undefined): T | null {
  return incoming !== undefined ? incoming : (stored ?? null);
}

export class UpdateUserUseCase {
  private readonly managerRules: ManagerRules;

  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly roleRepository: RoleRepositoryPort,
    private readonly designationRepository: DesignationRepositoryPort,
    private readonly payBandRepository: PayBandRepositoryPort,
    private readonly employeeProfileRepository: EmployeeProfileRepositoryPort,
    private readonly managerHistory: ManagerHistoryRepositoryPort,
    /** The current month (`YYYY-MM`) in the business timezone. */
    private readonly currentMonth: () => Promise<string>,
  ) {
    this.managerRules = new ManagerRules(employeeProfileRepository, designationRepository);
  }

  async execute(targetUserId: string, input: UpdateUserInput): Promise<UserSummary> {
    const existing = await this.userRepository.findById(targetUserId);
    if (!existing) throw AppError.notFound();

    const role = await this.roleRepository.findById(existing.roleId);
    if (!role) throw AppError.internal('INTERNAL', { reason: 'ROLE_NOT_FOUND', roleId: existing.roleId });

    if (input.designationId !== undefined) {
      if (role.name !== 'FIELD') throw AppError.badRequest('Designation only applies to FIELD role.');
      const designation = await this.designationRepository.findById(input.designationId);
      if (!designation) throw AppError.badRequest('Unknown designation.', { field: 'designationId' });
    }
    if (input.payBandId !== undefined) {
      if (role.name !== 'FIELD') throw AppError.badRequest('Pay band only applies to FIELD role.');
      const payBand = await this.payBandRepository.findById(input.payBandId);
      if (!payBand) throw AppError.badRequest('Unknown pay band.', { field: 'payBandId' });
    }
    if (input.managerId !== undefined) {
      const manager = await this.userRepository.findById(input.managerId);
      if (!manager) throw AppError.badRequest('Unknown manager.', { field: 'managerId' });
      // Someone who has left can't be anyone's manager: nobody could approve that team's requests.
      if (manager.status === 'inactive' && manager.id !== (await this.employeeProfileRepository.findByUserId(targetUserId))?.managerId) throw AppError.badRequest('That person has left (deactivated) and can’t be a manager.', { field: 'managerId' });
      await this.managerRules.assertNoReportingLoop(targetUserId, input.managerId);
      await this.managerRules.assertManagerIsHigher(targetUserId, input.designationId, input.managerId);
    }

    const existingProfile = await this.employeeProfileRepository.findByUserId(targetUserId);

    const mergedProfile: Omit<EmployeeProfile, 'id' | 'userId'> = {
      designationId: input.designationId ?? existingProfile?.designationId ?? null,
      payBandId: input.payBandId ?? existingProfile?.payBandId ?? null,
      managerId: input.managerId ?? existingProfile?.managerId ?? null,
      dateOfJoining: pick(input.basicDetails?.dateOfJoining, existingProfile?.dateOfJoining),
      onProbation: input.basicDetails?.onProbation ?? existingProfile?.onProbation ?? false,
      probationMonths: pick(input.basicDetails?.probationMonths, existingProfile?.probationMonths),
      esiNumber: pick(input.basicDetails?.esiNumber, existingProfile?.esiNumber),
      epfNumber: pick(input.basicDetails?.epfNumber, existingProfile?.epfNumber),
      // Territory writes these; an onboarding edit carries them through untouched.
      hqId: existingProfile?.hqId ?? null,
      zoneId: existingProfile?.zoneId ?? null,
      mobileNumber: input.basicDetails?.mobileNumber ?? existingProfile?.mobileNumber ?? null,
      alternateMobile: pick(input.basicDetails?.alternateMobile, existingProfile?.alternateMobile),
      guardianName: pick(input.basicDetails?.guardianName, existingProfile?.guardianName),
      dateOfBirth: input.basicDetails?.dateOfBirth ?? existingProfile?.dateOfBirth ?? null,
      address: input.basicDetails?.address ?? existingProfile?.address ?? null,
      permanentAddress: input.basicDetails?.permanentAddress ?? existingProfile?.permanentAddress ?? null,
      permanentSameAsPresent: input.basicDetails?.permanentSameAsPresent ?? existingProfile?.permanentSameAsPresent ?? false,
      qualification: pick(input.basicDetails?.qualification, existingProfile?.qualification),
      qualifications: input.basicDetails?.qualifications ?? existingProfile?.qualifications ?? [],
      previousEmployment: input.basicDetails?.previousEmployment ?? existingProfile?.previousEmployment ?? [],
      bankDetails: input.bankDetails ?? existingProfile?.bankDetails ?? null,
      documents: existingProfile?.documents ?? [],
    };

    const mergedName = input.basicDetails?.name ?? existing.name;
    const status = computeUserStatus(
      { status: existing.status, name: mergedName },
      mergedProfile,
      role.name,
    );

    const touchesProfile =
      input.basicDetails !== undefined ||
      input.bankDetails !== undefined ||
      input.designationId !== undefined ||
      input.payBandId !== undefined ||
      input.managerId !== undefined;

    if (touchesProfile) {
      await this.employeeProfileRepository.upsert(targetUserId, mergedProfile);
    }

    // A change of manager is kept as dated history; an edit takes the whole month it is made in (promotions use their own month).
    const previousManagerId = existingProfile?.managerId ?? null;
    if (input.managerId !== undefined && input.managerId !== previousManagerId) {
      await this.managerHistory.record({
        userId: targetUserId,
        managerId: input.managerId,
        previousManagerId,
        effectiveFrom: await this.currentMonth(),
        source: 'PROFILE_EDIT',
        promotionId: null,
        createdBy: null,
      });
    }

    const userPatch: Partial<Omit<User, 'id'>> = { status };
    if (input.basicDetails?.name !== undefined) userPatch.name = input.basicDetails.name;

    const updated = await this.userRepository.update(targetUserId, userPatch);

    return toUserSummary(updated, role.name, touchesProfile ? mergedProfile : existingProfile);
  }
}
