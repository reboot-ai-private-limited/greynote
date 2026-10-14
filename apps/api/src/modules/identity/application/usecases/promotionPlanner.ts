import type { CtcContextPort } from './ctcContext.js';
import type {
  CtcLineDto,
  PromotionAttentionDto,
  PromotionDto,
  PromotionPersonDto,
  PromotionPositionDto,
  PromotionPreviewDto,
  PromotionRequestDto,
  PromotionTeamRowDto,
} from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import { CtcBreakdownError, EMPTY_STRUCTURE, computeStructuredBreakdown, type CtcLine } from '../../domain/ctcBreakdown.js';
import type { CtcAssignmentRepositoryPort } from '../../domain/ctcAssignment.repository.port.js';
import type { ConfigProviderPort } from '../../domain/configProvider.port.js';
import type { Designation } from '../../domain/designation.entity.js';
import type { DesignationRepositoryPort } from '../../domain/designation.repository.port.js';
import type { EmployeeProfile } from '../../domain/employeeProfile.entity.js';
import type { EmployeeProfileRepositoryPort } from '../../domain/employeeProfile.repository.port.js';
import type { PayBand } from '../../domain/payBand.entity.js';
import type { PayBandRepositoryPort } from '../../domain/payBand.repository.port.js';
import type { PayComponentRepositoryPort } from '../../domain/payComponent.repository.port.js';
import type { Promotion } from '../../domain/promotion.entity.js';
import type { PromotionRepositoryPort } from '../../domain/promotion.repository.port.js';
import { reachesUpward } from '../../domain/reportingChain.js';
import { judgePromotion, type PlanFacts, type PlanPerson, type PlanResult } from '../../domain/promotionPlan.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';
import type { User } from '../../domain/user.entity.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';

const FAR_FUTURE = '9999-12';

/** The month after `month` (`YYYY-MM`). */
export function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

interface Person {
  user: User;
  profile: EmployeeProfile | null;
}

/** Looks people, designations and grades up once and hands out the shapes the plan and the screens need. */
export class PeopleLookup {
  private constructor(
    private readonly people: Map<string, Person>,
    private readonly designations: Map<string, Designation>,
    private readonly payBands: Map<string, PayBand>,
  ) {}

  static async load(
    ids: string[],
    repos: { users: UserRepositoryPort; profiles: EmployeeProfileRepositoryPort; designations: DesignationRepositoryPort; payBands: PayBandRepositoryPort },
  ): Promise<PeopleLookup> {
    const unique = [...new Set(ids)];
    const [users, profiles, designations, payBands] = await Promise.all([repos.users.findByIds(unique), repos.profiles.findByUserIds(unique), repos.designations.list(), repos.payBands.list()]);
    const profileOf = new Map(profiles.map((p) => [p.userId, p]));
    return new PeopleLookup(
      new Map(users.map((u) => [u.id, { user: u, profile: profileOf.get(u.id) ?? null }])),
      new Map(designations.map((d) => [d.id, d])),
      new Map(payBands.map((b) => [b.id, b])),
    );
  }

  has(id: string): boolean {
    return this.people.has(id);
  }
  level(id: string | null): number | null {
    return id ? (this.designations.get(id)?.level ?? null) : null;
  }
  plan(id: string): PlanPerson | null {
    const p = this.people.get(id);
    if (!p) return null;
    return { id, name: p.user.name, employeeCode: p.user.employeeCode, level: this.level(p.profile?.designationId ?? null), active: p.user.status !== 'inactive' };
  }
  managerOf(id: string): string | null {
    return this.people.get(id)?.profile?.managerId ?? null;
  }
  dto(id: string | null): PromotionPersonDto | null {
    const p = id ? this.people.get(id) : undefined;
    if (!p) return null;
    return { id: p.user.id, name: p.user.name, employeeCode: p.user.employeeCode, designation: this.designations.get(p.profile?.designationId ?? '')?.name ?? null };
  }
  position(designationId: string | null, payBandId: string | null, managerId: string | null): PromotionPositionDto {
    const band = payBandId ? this.payBands.get(payBandId) : undefined;
    return {
      designation: designationId ? (this.designations.get(designationId)?.name ?? null) : null,
      payBand: band ? { id: band.id, name: band.name } : null,
      manager: this.dto(managerId),
    };
  }
}

export interface PlannerDeps {
  users: UserRepositoryPort;
  roles: RoleRepositoryPort;
  designations: DesignationRepositoryPort;
  payBands: PayBandRepositoryPort;
  profiles: EmployeeProfileRepositoryPort;
  components: PayComponentRepositoryPort;
  context: CtcContextPort;
  assignments: CtcAssignmentRepositoryPort;
  promotions: PromotionRepositoryPort;
  config: ConfigProviderPort;
  /** The current month (`YYYY-MM`) in the business timezone. */
  currentMonth: () => Promise<string>;
}

export interface PlannedPromotion {
  userId: string;
  request: PromotionRequestDto;
  result: PlanResult;
  preview: PromotionPreviewDto;
}

/** Gathers what a promotion touches and judges it. Shared by the preview (reports problems) and the schedule (refuses on them). */
export class PromotionPlanner {
  constructor(private readonly deps: PlannerDeps) {}

  async plan(userId: string, request: PromotionRequestDto): Promise<PlannedPromotion> {
    const d = this.deps;
    const user = await d.users.findById(userId);
    if (!user) throw AppError.notFound();
    const [role, profile, earliestMonth, scheduled, jump] = await Promise.all([
      d.roles.findById(user.roleId),
      d.profiles.findByUserId(userId),
      d.currentMonth().then(nextMonth),
      d.promotions.findScheduledByUser(userId),
      d.config.get('CTC_JUMP_WARN_PERCENT'),
    ]);

    const reportIds = await d.profiles.findUserIdsByFilter({ managerId: userId });
    const moveTargetIds = request.teamMoves.map((m) => m.toManagerId);
    const lookup = await PeopleLookup.load(
      [userId, ...reportIds, ...moveTargetIds, ...(request.toManagerId ? [request.toManagerId] : []), ...(profile?.managerId ? [profile.managerId] : [])],
      d,
    );

    const reports = reportIds.map((id) => lookup.plan(id)).filter((p): p is PlanPerson => p !== null && p.active);
    const employee = lookup.plan(userId)!;

    const toDesignation = request.toDesignationId ? await this.designationFacts(request.toDesignationId) : null;
    const toPayBand = request.toPayBandId ? { found: (await d.payBands.findById(request.toPayBandId)) !== null } : null;
    const toManager = request.toManagerId
      ? { person: lookup.plan(request.toManagerId), reachesEmployee: await this.reaches(request.toManagerId, userId) }
      : null;

    const teamMoves = await Promise.all(
      request.teamMoves.map(async (m) => ({
        userId: m.userId,
        toManagerId: m.toManagerId,
        target: lookup.plan(m.toManagerId),
        targetReachesReport: m.toManagerId === m.userId ? false : await this.reaches(m.toManagerId, m.userId),
      })),
    );

    let ctc: PlanFacts['request']['ctc'] = null;
    let lines: CtcLine[] = [];
    if (request.ctc) {
      const previous = await d.assignments.findEffective(userId, FAR_FUTURE);
      let breakdownError: string | null = null;
      try {
        lines = computeStructuredBreakdown(await d.components.list(), request.ctc.ctcAnnualPaise, previous?.structure ?? EMPTY_STRUCTURE, request.ctc.overrides ?? {}, await d.context.read());
      } catch (error) {
        if (!(error instanceof CtcBreakdownError)) throw error;
        breakdownError = error.message;
      }
      ctc = { annualPaise: request.ctc.ctcAnnualPaise, previousAnnualPaise: previous?.ctcAnnualPaise ?? null, breakdownError };
    }

    const facts: PlanFacts = {
      effectiveFrom: request.effectiveFrom,
      earliestMonth,
      employee: { ...employee, isField: role?.name === 'FIELD', managerId: profile?.managerId ?? null },
      reports,
      request: { toDesignation, toPayBand, toManager, ctc, teamMoves },
      currentManager: profile?.managerId ? lookup.plan(profile.managerId) : null,
      currentLevel: employee.level,
      alreadyScheduled: scheduled !== null,
      jumpWarnPercent: Number(jump),
    };
    const result = judgePromotion(facts);

    const fromDesignation = profile?.designationId ?? null;
    const fromPayBand = profile?.payBandId ?? null;
    const fromManager = profile?.managerId ?? null;
    const toDesignationId = request.toDesignationId ?? fromDesignation;
    const toPayBandId = request.toPayBandId ?? fromPayBand;
    const toManagerId = request.toManagerId ?? fromManager;
    const team: PromotionTeamRowDto[] = reports
      .map((p): PromotionTeamRowDto => {
        const move = request.teamMoves.find((m) => m.userId === p.id);
        return { person: lookup.dto(p.id)!, toManager: move ? lookup.dto(move.toManagerId) : null, stays: move?.toManagerId === userId };
      })
      .sort((a, b) => a.person.name.localeCompare(b.person.name));

    const preview: PromotionPreviewDto = {
      employee: lookup.dto(userId)!,
      effectiveFrom: request.effectiveFrom,
      earliestMonth,
      from: lookup.position(fromDesignation, fromPayBand, fromManager),
      to: lookup.position(toDesignationId, toPayBandId, toManagerId),
      team,
      ctc: request.ctc && lines.length > 0 ? { previousAnnualPaise: ctc?.previousAnnualPaise ?? null, newAnnualPaise: request.ctc.ctcAnnualPaise, lines: lines.map((l): CtcLineDto => ({ ...l })) } : null,
      warnings: result.warnings,
      problems: result.problems,
      canSchedule: result.problems.length === 0,
    };
    return { userId, request, result, preview };
  }

  /** The kept promotions, as the screens show them, with what needs HR's attention. */
  async views(promotions: Promotion[]): Promise<PromotionDto[]> {
    if (promotions.length === 0) return [];
    // A scheduled promotion's team as it is now: someone added since is not in its plan.
    const currentReports = new Map<string, string[]>();
    for (const p of promotions.filter((x) => x.status === 'SCHEDULED')) currentReports.set(p.id, await this.deps.profiles.findUserIdsByFilter({ managerId: p.userId }));
    const ids = promotions
      .flatMap((p) => [p.userId, p.fromManagerId, p.toManagerId, ...p.teamMoves.flatMap((m) => [m.userId, m.toManagerId]), ...p.skippedMoves.map((m) => m.userId), ...p.unplannedReportIds, ...(currentReports.get(p.id) ?? [])])
      .filter((id): id is string => id !== null);
    const lookup = await PeopleLookup.load(ids, this.deps);
    return promotions.map((p) => {
      const team: PromotionTeamRowDto[] = p.teamMoves
        .map((m) => ({ person: lookup.dto(m.userId), toManager: lookup.dto(m.toManagerId), stays: m.toManagerId === p.userId }))
        .filter((row): row is PromotionTeamRowDto => row.person !== null)
        .sort((a, b) => a.person.name.localeCompare(b.person.name));
      return {
        id: p.id,
        userId: p.userId,
        employee: lookup.dto(p.userId),
        note: p.note,
        attention: this.attention(p, lookup, currentReports.get(p.id) ?? []),
        effectiveFrom: p.effectiveFrom,
        status: p.status,
        from: lookup.position(p.fromDesignationId, p.fromPayBandId, p.fromManagerId),
        to: lookup.position(p.toDesignationId ?? p.fromDesignationId, p.toPayBandId ?? p.fromPayBandId, p.toManagerId ?? p.fromManagerId),
        ctcAnnualPaise: p.ctc?.ctcAnnualPaise ?? null,
        team,
        reason: p.reason,
        createdBy: p.createdBy,
        createdAt: p.createdAt.toISOString(),
        appliedAt: p.appliedAt?.toISOString() ?? null,
        cancelledAt: p.cancelledAt?.toISOString() ?? null,
      };
    });
  }

  private attention(p: Promotion, lookup: PeopleLookup, reportsNow: string[]): PromotionAttentionDto[] {
    const items: PromotionAttentionDto[] = [];
    const who = lookup.dto(p.userId)?.name ?? 'The promoted person';
    if (p.status === 'SCHEDULED') {
      const planned = new Set(p.teamMoves.map((m) => m.userId));
      for (const id of reportsNow) {
        const person = lookup.dto(id);
        if (person && lookup.plan(id)?.active && !planned.has(id)) {
          items.push({ kind: 'NOT_IN_PLAN', message: `${person.name} joined ${who}'s team after this was scheduled and is not in the plan. They will stay with ${who}.`, person });
        }
      }
    }
    if (p.status === 'APPLIED') {
      const still = (id: string) => lookup.managerOf(id) === p.userId;
      for (const id of p.unplannedReportIds) {
        const person = lookup.dto(id);
        if (person && still(id)) items.push({ kind: 'STILL_WITH_PROMOTED', message: `${person.name} was not in the plan and still reports to ${who}.`, person });
      }
      for (const m of p.skippedMoves) {
        const person = lookup.dto(m.userId);
        if (person && still(m.userId)) items.push({ kind: 'STILL_WITH_PROMOTED', message: `${person.name} could not be moved to ${lookup.dto(m.toManagerId)?.name ?? 'the chosen manager'} and still reports to ${who}.`, person });
      }
    }
    if (p.note) items.push({ kind: 'NOTE', message: p.note, person: null });
    return items;
  }

  private async designationFacts(id: string): Promise<{ found: boolean; level: number | null }> {
    const designation = await this.deps.designations.findById(id);
    return { found: designation !== null, level: designation?.level ?? null };
  }

  private reaches(start: string, target: string): Promise<boolean> {
    return reachesUpward(async (id) => (await this.deps.profiles.findByUserId(id))?.managerId ?? null, start, target);
  }
}
