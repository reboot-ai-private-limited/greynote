import type { PromotionDto, PromotionPreviewDto, PromotionRequestDto, PromotionStatus } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import type { PromotionRepositoryPort } from '../../domain/promotion.repository.port.js';
import type { EmployeeProfileRepositoryPort } from '../../domain/employeeProfile.repository.port.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import type { PromotionPlanner } from './promotionPlanner.js';

/** What a promotion would change, and what stops it, without saving anything. */
export class PreviewPromotionUseCase {
  constructor(private readonly planner: PromotionPlanner) {}

  async execute(userId: string, request: PromotionRequestDto): Promise<PromotionPreviewDto> {
    return (await this.planner.plan(userId, request)).preview;
  }
}

/**
 * Saves a promotion as SCHEDULED. It is refused while anything in the preview is a problem — above all while a direct report
 * has no new manager. Nothing about the employee or their team changes now: the promotion applies on the 1st of its month.
 */
export class SchedulePromotionUseCase {
  constructor(
    private readonly planner: PromotionPlanner,
    private readonly promotions: PromotionRepositoryPort,
    private readonly profiles: EmployeeProfileRepositoryPort,
  ) {}

  async execute(userId: string, request: PromotionRequestDto, createdBy: string): Promise<PromotionDto> {
    const planned = await this.planner.plan(userId, request);
    const [first] = planned.result.problems;
    if (first) {
      throw AppError.badRequest(first.message, { field: first.field, problems: planned.result.problems });
    }
    const profile = await this.profiles.findByUserId(userId);
    const saved = await this.promotions.create({
      userId,
      effectiveFrom: request.effectiveFrom,
      fromDesignationId: profile?.designationId ?? null,
      toDesignationId: request.toDesignationId ?? null,
      fromPayBandId: profile?.payBandId ?? null,
      toPayBandId: request.toPayBandId ?? null,
      fromManagerId: profile?.managerId ?? null,
      toManagerId: request.toManagerId ?? null,
      ctc: request.ctc ? { ctcAnnualPaise: request.ctc.ctcAnnualPaise, overrides: request.ctc.overrides ?? {} } : null,
      teamMoves: request.teamMoves.map((m) => ({ userId: m.userId, toManagerId: m.toManagerId })),
      reason: request.reason?.trim() ? request.reason.trim() : null,
      createdBy,
    });
    const [view] = await this.planner.views([saved]);
    return view!;
  }
}

/** An employee's promotions, newest first, with names resolved. */
export class ListPromotionsUseCase {
  constructor(
    private readonly planner: PromotionPlanner,
    private readonly promotions: PromotionRepositoryPort,
    private readonly users: UserRepositoryPort,
  ) {}

  async execute(userId: string): Promise<PromotionDto[]> {
    if (!(await this.users.findById(userId))) throw AppError.notFound();
    return this.planner.views(await this.promotions.listByUser(userId));
  }
}

/** Every promotion in the org, newest first, optionally of one status — the Admin/HR overview with what needs attention. */
export class ListAllPromotionsUseCase {
  constructor(
    private readonly planner: PromotionPlanner,
    private readonly promotions: PromotionRepositoryPort,
  ) {}

  async execute(status?: PromotionStatus): Promise<PromotionDto[]> {
    return this.planner.views(await this.promotions.list({ status }));
  }
}

/** Cancels a promotion that has not applied. Nothing about the employee or their team had changed, so nothing is undone. */
export class CancelPromotionUseCase {
  constructor(
    private readonly planner: PromotionPlanner,
    private readonly promotions: PromotionRepositoryPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(promotionId: string): Promise<PromotionDto> {
    const existing = await this.promotions.findById(promotionId);
    if (!existing) throw AppError.notFound();
    if (existing.status !== 'SCHEDULED' || !(await this.promotions.cancel(promotionId, this.now()))) {
      throw AppError.conflict('Only a scheduled promotion can be cancelled.', { status: existing.status });
    }
    const [view] = await this.planner.views([(await this.promotions.findById(promotionId))!]);
    return view!;
  }
}
