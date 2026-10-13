import type { RoleName } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import type { ComplianceBlockRepositoryPort } from '../../domain/complianceBlock.repository.port.js';
import type { Address, BankDetails, PreviousEmployment, Qualification, UserDocument } from '../../domain/employeeProfile.entity.js';
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
  /** The currently-open compliance block, if any. */
  currentBlock: { reason: string; blockedAt: Date } | null;
  /** Every block on the employee, newest first — who cleared each, in what role, and why. */
  blockHistory: Array<{ reason: string; blockedAt: Date; unblockedAt: Date | null; unblockedBy: string | null; unblockedByRole: string | null; unblockReason: string | null }>;
  /** `null` for a non-FIELD user, or a FIELD user whose onboarding hasn't started yet. */
  profile: {
    designationId: string | null;
    payBandId: string | null;
    managerId: string | null;
    dateOfJoining: Date | null;
    onProbation: boolean;
    probationMonths: number | null;
    esiNumber: string | null;
    hqId: string | null;
    zoneId: string | null;
    mobileNumber: string | null;
    alternateMobile: string | null;
    guardianName: string | null;
    dateOfBirth: Date | null;
    address: Address | null;
    permanentAddress: Address | null;
    permanentSameAsPresent: boolean;
    qualification: string | null;
    qualifications: Qualification[];
    previousEmployment: PreviousEmployment[];
    bankDetails: BankDetails | null;
    documents: UserDocument[];
    /** The photo's address; its storage id is never sent. */
    photoUrl: string | null;
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
    const history = await this.complianceBlockRepository.listByUserId(userId);
    const openBlock = user.isBlocked ? (history.find((b) => b.unblockedAt === null) ?? null) : null;

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
      blockHistory: history.map(({ reason, blockedAt, unblockedAt, unblockedBy, unblockedByRole, unblockReason }) => ({ reason, blockedAt, unblockedAt, unblockedBy, unblockedByRole, unblockReason })),
      profile: profile
        ? {
            designationId: profile.designationId,
            payBandId: profile.payBandId,
            managerId: profile.managerId,
            dateOfJoining: profile.dateOfJoining,
            onProbation: profile.onProbation,
            probationMonths: profile.probationMonths,
            esiNumber: profile.esiNumber,
            hqId: profile.hqId,
            zoneId: profile.zoneId,
            mobileNumber: profile.mobileNumber,
            alternateMobile: profile.alternateMobile,
            guardianName: profile.guardianName,
            dateOfBirth: profile.dateOfBirth,
            address: profile.address,
            permanentAddress: profile.permanentAddress,
            permanentSameAsPresent: profile.permanentSameAsPresent,
            qualification: profile.qualification,
            qualifications: profile.qualifications,
            previousEmployment: profile.previousEmployment,
            bankDetails: profile.bankDetails,
            documents: profile.documents,
            photoUrl: profile.photo?.url ?? null,
          }
        : null,
    };
  }
}
