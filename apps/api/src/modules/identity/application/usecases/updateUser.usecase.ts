import { AppError } from '@/shared/errors/AppError.js';
import { computeUserStatus } from '../../domain/onboarding.js';
import type { DesignationRepositoryPort } from '../../domain/designation.repository.port.js';
import type { PayBandRepositoryPort } from '../../domain/payBand.repository.port.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';
import type { Address, BankDetails, User, UserSummary } from '../../domain/user.entity.js';
import { toUserSummary } from '../../domain/user.entity.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';

/**
 * Every section optional — this is the incremental-onboarding PATCH (decision 13). Each call
 * fills in one section (a *complete* `address`/`bankDetails` object, not field-by-field), and
 * `status` is recomputed from the merged result after applying whichever sections were sent.
 * `status: 'inactive'` may be set explicitly (deactivation/offboarding) — once set, it's sticky:
 * `computeUserStatus` never upgrades an `inactive` user back to `active`/`pending` as a side
 * effect of a later onboarding PATCH.
 */
export interface UpdateUserInput {
  basicDetails?: {
    name?: string;
    mobileNumber?: string;
    guardianName?: string;
    dateOfBirth?: Date;
    qualification?: string;
    address?: Address;
  };
  bankDetails?: BankDetails;
  designationId?: string;
  payBandId?: string;
  managerId?: string;
  status?: 'inactive';
}

export class UpdateUserUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly roleRepository: RoleRepositoryPort,
    private readonly designationRepository: DesignationRepositoryPort,
    private readonly payBandRepository: PayBandRepositoryPort,
  ) {}

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
    }

    const merged: Omit<User, 'id'> = {
      ...existing,
      name: input.basicDetails?.name ?? existing.name,
      mobileNumber: input.basicDetails?.mobileNumber ?? existing.mobileNumber,
      guardianName: input.basicDetails?.guardianName ?? existing.guardianName,
      dateOfBirth: input.basicDetails?.dateOfBirth ?? existing.dateOfBirth,
      qualification: input.basicDetails?.qualification ?? existing.qualification,
      address: input.basicDetails?.address ?? existing.address,
      bankDetails: input.bankDetails ?? existing.bankDetails,
      designationId: input.designationId ?? existing.designationId,
      payBandId: input.payBandId ?? existing.payBandId,
      managerId: input.managerId ?? existing.managerId,
      status: input.status ?? existing.status,
    };

    const status = computeUserStatus(merged, role.name);

    const updated = await this.userRepository.update(targetUserId, {
      name: merged.name,
      mobileNumber: merged.mobileNumber,
      guardianName: merged.guardianName,
      dateOfBirth: merged.dateOfBirth,
      qualification: merged.qualification,
      address: merged.address,
      bankDetails: merged.bankDetails,
      designationId: merged.designationId,
      payBandId: merged.payBandId,
      managerId: merged.managerId,
      status,
    });

    return toUserSummary(updated, role.name);
  }
}
