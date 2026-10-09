import { AppError } from '@/shared/errors/AppError.js';
import {
  computeStructuredBreakdown,
  EMPTY_STRUCTURE,
  type CtcStructure,
} from '../../domain/ctcBreakdown.js';
import { ctcJumpWarning } from '../../domain/ctcJump.js';
import type { CtcAssignment } from '../../domain/ctcAssignment.entity.js';
import type { CtcAssignmentRepositoryPort } from '../../domain/ctcAssignment.repository.port.js';
import type { ConfigProviderPort } from '../../domain/configProvider.port.js';
import type { PayComponentRepositoryPort } from '../../domain/payComponent.repository.port.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import { asBadRequest } from './payComponentFormula.js';

export interface AssignCtcInput {
  ctcAnnualPaise: number;
  /** `YYYY-MM` — the first payroll month it applies to. */
  effectiveFrom: string;
  overrides?: Record<string, number>;
  /** This employee's own shape of the org formula: Basic %, edited, removed and added lines. */
  structure?: CtcStructure;
  reason?: string | null;
}

const FAR_FUTURE = '9999-12';

/**
 * Saves a new CTC revision for a FIELD employee. The CTC is the employee's own: it does not depend on, or have to fit, their
 * pay grade (decision-log 2026-10-06). A rise of more than `CTC_JUMP_WARN_PERCENT` over the previous revision saves but comes
 * back with a warning. Never edits an earlier revision: a later one (or one saved later for the same month) simply takes over
 * from `effectiveFrom`, and past payroll keeps pointing at what was in force then.
 */
export class AssignCtcUseCase {
  constructor(
    private readonly users: UserRepositoryPort,
    private readonly roles: RoleRepositoryPort,
    private readonly components: PayComponentRepositoryPort,
    private readonly assignments: CtcAssignmentRepositoryPort,
    private readonly config: ConfigProviderPort,
  ) {}

  async execute(userId: string, input: AssignCtcInput, createdBy: string): Promise<{ assignment: CtcAssignment; warning: string | null }> {
    const user = await this.users.findById(userId);
    if (!user) throw AppError.notFound();
    const role = await this.roles.findById(user.roleId);
    if (role?.name !== 'FIELD') throw AppError.badRequest('Only field employees have a CTC.');

    const overrides = input.overrides ?? {};
    const formula = await this.components.list();
    const structure = input.structure ?? EMPTY_STRUCTURE;
    const lines = asBadRequest(() =>
      computeStructuredBreakdown(formula, input.ctcAnnualPaise, structure, overrides),
    );
    const previous = await this.assignments.findEffective(userId, FAR_FUTURE);
    const warning = ctcJumpWarning(previous?.ctcAnnualPaise ?? null, input.ctcAnnualPaise, Number(await this.config.get('CTC_JUMP_WARN_PERCENT')));
    const assignment = await this.assignments.create({
      userId,
      ctcAnnualPaise: input.ctcAnnualPaise,
      effectiveFrom: input.effectiveFrom,
      overrides,
      structure,
      lines,
      reason: input.reason ?? null,
      createdBy,
    });
    return { assignment, warning };
  }
}
