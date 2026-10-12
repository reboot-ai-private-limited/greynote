import type { RoleName } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import type { CtcAssignmentRepositoryPort } from '../../domain/ctcAssignment.repository.port.js';
import type { DesignationRepositoryPort } from '../../domain/designation.repository.port.js';
import type { EmployeeCodeGeneratorPort } from '../../domain/employeeCode.generator.port.js';
import { draftGaps, type DraftAddress, type EmployeeDraft } from '../../domain/employeeDraft.entity.js';
import type { EmployeeDraftRepositoryPort } from '../../domain/employeeDraft.repository.port.js';
import type { Address } from '../../domain/employeeProfile.entity.js';
import { isTopDesignation } from '../../domain/onboarding.js';
import type { PasswordHasherPort } from '../../domain/passwordHasher.port.js';
import { generatePassword } from '../../domain/passwordGenerator.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import type { AssignCtcUseCase } from './assignCtc.usecase.js';
import type { CreateUserUseCase } from './createUser.usecase.js';
import type { UpdateUserUseCase } from './updateUser.usecase.js';

/** Sets the new employee's HQ. Territory sits above Identity, so the container binds this after both are built. */
export type HqAssigner = (userId: string, hqId: string, actorId: string) => Promise<unknown>;

export interface FinalizedEmployee {
  userId: string;
  employeeCode: string;
  /** Shown once, to be shared with the employee; only its hash is kept. */
  password: string;
}

const FAR_FUTURE = '9999-12';

const date = (value: string | undefined): Date | null => (value ? new Date(value) : null);

function toAddress(address: DraftAddress | undefined): Address {
  return {
    line1: address?.line1 ?? null,
    line2: address?.line2 ?? null,
    district: address?.district ?? '',
    state: address?.state ?? '',
    pincode: address?.pincode ?? '',
    country: address?.country || 'India',
  };
}

/**
 * The wizard's last step: turns a complete draft into the real employee — login with the next GRN
 * code and a generated password, profile, HQ, CTC — and removes the draft. Built on the use cases
 * that already own each piece, so every rule they enforce (loop-free manager, active status) holds.
 *
 * Not one transaction (HQ lives in another module), so a failure part-way keeps the draft and
 * remembers the login it created: pressing Create again carries on with that same login (with a
 * fresh password) instead of making a second employee.
 */
export class FinalizeEmployeeDraftUseCase {
  constructor(
    private readonly drafts: EmployeeDraftRepositoryPort,
    private readonly users: UserRepositoryPort,
    private readonly designations: DesignationRepositoryPort,
    private readonly codes: EmployeeCodeGeneratorPort,
    private readonly createUser: CreateUserUseCase,
    private readonly updateUser: UpdateUserUseCase,
    private readonly assignCtc: AssignCtcUseCase,
    private readonly ctcAssignments: CtcAssignmentRepositoryPort,
    private readonly passwordHasher: PasswordHasherPort,
    private readonly assignHq: () => HqAssigner,
    private readonly currentMonth: () => Promise<string>,
  ) {}

  async execute(actor: { id: string; role: RoleName }, draftId: string): Promise<FinalizedEmployee> {
    const draft = await this.drafts.findById(draftId);
    if (!draft) throw AppError.notFound('No such draft.');
    const { data } = draft;

    const top = isTopDesignation(data.work?.designationId ?? null, await this.designations.list());
    const gaps = draftGaps(data, top);
    if (gaps.length > 0) {
      throw AppError.badRequest('Some required details are missing.', { gaps });
    }

    const password = generatePassword();
    const { userId, employeeCode } = await this.ensureLogin(actor, draft, password);

    const present = toAddress(data.address?.present);
    const sameAsPresent = data.address?.permanentSameAsPresent === true;
    await this.updateUser.execute(userId, {
      basicDetails: {
        name: data.personal?.name as string,
        mobileNumber: data.personal?.mobileNumber as string,
        alternateMobile: data.personal?.alternateMobile ?? null,
        guardianName: data.personal?.guardianName as string,
        dateOfBirth: date(data.personal?.dateOfBirth) as Date,
        dateOfJoining: date(data.personal?.dateOfJoining),
        onProbation: data.personal?.onProbation ?? false,
        probationMonths: data.personal?.probationMonths ?? null,
        esiNumber: data.personal?.esiNumber ?? null,
        address: present,
        permanentAddress: sameAsPresent ? present : toAddress(data.address?.permanent),
        permanentSameAsPresent: sameAsPresent,
        qualifications: (data.qualifications ?? []).map((row) => ({
          degree: row.degree as string,
          institute: row.institute as string,
          yearOfPassing: row.yearOfPassing as number,
        })),
        previousEmployment: (data.experience ?? []).map((row) => ({
          companyName: row.companyName as string,
          joiningDate: new Date(row.joiningDate as string),
          endDate: date(row.endDate),
        })),
      },
      bankDetails: {
        bankName: data.bank?.bankName as string,
        ifsc: data.bank?.ifsc as string,
        accountNumber: data.bank?.accountNumber as string,
        accountHolderName: data.bank?.accountHolderName as string,
        branchName: data.bank?.branchName ?? null,
      },
      designationId: data.work?.designationId as string,
      payBandId: data.compensation?.payBandId as string,
      ...(!top && data.work?.managerId ? { managerId: data.work.managerId } : {}),
    });

    await this.assignHq()(userId, data.work?.hqId as string, actor.id);

    const ctc = data.compensation?.ctcAnnualPaise;
    if (ctc && !(await this.ctcAssignments.findEffective(userId, FAR_FUTURE))) {
      const effectiveFrom =
        data.compensation?.effectiveFrom ?? data.personal?.dateOfJoining?.slice(0, 7) ?? (await this.currentMonth());
      const structure = data.compensation?.structure;
      await this.assignCtc.execute(userId, { ctcAnnualPaise: ctc, effectiveFrom, reason: 'Onboarding', ...(structure && { structure }) }, actor.id);
    }

    await this.drafts.delete(draftId);
    return { userId, employeeCode, password };
  }

  /** The login for this draft: the one a failed earlier try made (given a fresh password), else a new one. */
  private async ensureLogin(
    actor: { id: string; role: RoleName },
    draft: EmployeeDraft,
    password: string,
  ): Promise<{ userId: string; employeeCode: string }> {
    if (draft.createdUserId) {
      const existing = await this.users.findById(draft.createdUserId);
      if (existing) {
        await this.users.update(existing.id, { passwordHash: await this.passwordHasher.hash(password) });
        return { userId: existing.id, employeeCode: existing.employeeCode };
      }
    }

    const employeeCode = await this.codes.next();
    const created = await this.createUser.execute(actor.role, {
      role: 'FIELD',
      employeeCode,
      name: draft.data.personal?.name as string,
      password,
      phone: draft.data.personal?.mobileNumber as string,
    });
    await this.drafts.update(draft.id, { createdUserId: created.id });
    return { userId: created.id, employeeCode };
  }
}
