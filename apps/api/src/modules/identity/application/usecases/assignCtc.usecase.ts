import { AppError } from '@/shared/errors/AppError.js';
import { computeCtcBreakdown } from '../../domain/ctcBreakdown.js';
import type { CtcAssignment } from '../../domain/ctcAssignment.entity.js';
import type { CtcAssignmentRepositoryPort } from '../../domain/ctcAssignment.repository.port.js';
import type { PayComponentRepositoryPort } from '../../domain/payComponent.repository.port.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import { asBadRequest } from './payComponentFormula.js';

export interface AssignCtcInput {
  ctcAnnualPaise: number;
  /** `YYYY-MM` — the first payroll month it applies to. */
  effectiveFrom: string;
  overrides?: Record<string, number>;
  reason?: string | null;
}

/**
 * Saves a new CTC revision for a FIELD employee. Never edits an earlier one: a later revision (or one saved later for the
 * same month) simply takes over from `effectiveFrom`, and past payroll keeps pointing at what was in force then.
 */
export class AssignCtcUseCase {
  constructor(
    private readonly users: UserRepositoryPort,
    private readonly roles: RoleRepositoryPort,
    private readonly components: PayComponentRepositoryPort,
    private readonly assignments: CtcAssignmentRepositoryPort,
  ) {}

  async execute(userId: string, input: AssignCtcInput, createdBy: string): Promise<CtcAssignment> {
    const user = await this.users.findById(userId);
    if (!user) throw AppError.notFound();
    const role = await this.roles.findById(user.roleId);
    if (role?.name !== 'FIELD') throw AppError.badRequest('Only field employees have a CTC.');

    const overrides = input.overrides ?? {};
    const formula = await this.components.list();
    const lines = asBadRequest(() => computeCtcBreakdown(formula, input.ctcAnnualPaise, overrides));
    return this.assignments.create({
      userId,
      ctcAnnualPaise: input.ctcAnnualPaise,
      effectiveFrom: input.effectiveFrom,
      overrides,
      lines,
      reason: input.reason ?? null,
      createdBy,
    });
  }
}
