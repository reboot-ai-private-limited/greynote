import type { RoleName } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import type { ComplianceBlockRepositoryPort } from '../../domain/complianceBlock.repository.port.js';
import type { Address, BankDetails, UserDocument } from '../../domain/employeeProfile.entity.js';
import type { EmployeeProfileRepositoryPort } from '../../domain/employeeProfile.repository.port.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';
import type { UserStatus } from '../../domain/user.entity.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';

export interface UserDetail {
  id: string;
  employeeCode: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: RoleName;
  status: UserStatus;
  isBlocked: boolean;
  lastLoginAt: Date | null;
  /** The currently-open compliance block, if any — never the full history (that's an audit concern, not a display one). */
  currentBlock: { reason: string; blockedAt: Date } | null;
  /** `null` for a non-FIELD user, or a FIELD user whose onboarding hasn't started yet. */
  profile: {
    designationId: string | null;
    payBandId: string | null;
    managerId: string | null;
    dateOfJoining: Date | null;
    mobileNumber: string | null;
    guardianName: string | null;
    dateOfBirth: Date | null;
    address: Address | null;
    qualification: string | null;
    bankDetails: BankDetails | null;
    documents: UserDocument[];
  } | null;
}

/**
 * Nothing else exposes a user's full onboarding profile — `UserSummary` never carried personal/
 * bank details (`GET /users` stays lightweight on purpose). This is the one place that merges
 * `User` + `EmployeeProfile` + the open `ComplianceBlock` (if any) for Admin/HR to actually view.
 */
export class GetUserDetailUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly roleRepository: RoleRepositoryPort,
    private readonly employeeProfileRepository: EmployeeProfileRepositoryPort,
    private readonly complianceBlockRepository: ComplianceBlockRepositoryPort,
  ) {}

  async execute(userId: string): Promise<UserDetail> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw AppError.notFound();

    const role = await this.roleRepository.findById(user.roleId);
    if (!role) throw AppError.internal('INTERNAL', { reason: 'ROLE_NOT_FOUND', roleId: user.roleId });

    const profile = await this.employeeProfileRepository.findByUserId(userId);
    const openBlock = user.isBlocked ? await this.complianceBlockRepository.findOpenByUserId(userId) : null;

    return {
      id: user.id,
      employeeCode: user.employeeCode,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: role.name,
      status: user.status,
      isBlocked: user.isBlocked,
      lastLoginAt: user.lastLoginAt,
      currentBlock: openBlock ? { reason: openBlock.reason, blockedAt: openBlock.blockedAt } : null,
      profile: profile
        ? {
            designationId: profile.designationId,
            payBandId: profile.payBandId,
            managerId: profile.managerId,
            dateOfJoining: profile.dateOfJoining,
            mobileNumber: profile.mobileNumber,
            guardianName: profile.guardianName,
            dateOfBirth: profile.dateOfBirth,
            address: profile.address,
            qualification: profile.qualification,
            bankDetails: profile.bankDetails,
            documents: profile.documents,
          }
        : null,
    };
  }
}
