import { AppError } from '@/shared/errors/AppError.js';
import type { DailyPlanRepositoryPort } from '../../domain/dailyPlan.repository.port.js';
import type { MonthlyPlanRepositoryPort } from '../../domain/monthlyPlan.repository.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { ApprovalsPort, PlanApprovalStatus } from '../../domain/approvals.port.js';
import { isFieldDay } from '../../domain/plan.js';
import type { CarryOver } from '../carryOver.js';
import type { ManagerScope } from '../managerScope.js';
import { assertInDownline } from '../assertInDownline.js';
import { planStatus } from '../planViews.js';

export interface TeamSuggestionPerson {
  userId: string;
  name: string;
  /** Where the routes came from: their Daily Plan for the day, else their Monthly Plan's entry, else nothing planned. */
  source: 'DAILY_PLAN' | 'MONTHLY_PLAN' | 'NONE';
  /** Their Daily Plan's status, or `null` when they have none for the day. */
  planStatus: PlanApprovalStatus | null;
  routeIds: string[];
  doctorIds: string[];
}

export interface TeamSuggestion {
  planDate: string;
  people: TeamSuggestionPerson[];
  /** The people's routes and doctors merged, each once. */
  routeIds: string[];
  doctorIds: string[];
}

/**
 * What a manager's plan would start with if they work with these team members that day: each person's routes and doctors from
 * their Daily Plan, else (no plan yet) their Monthly Plan's routes and the doctors assigned to them on those routes. Read-only.
 * The routes are what the manager's day takes (a manager can't choose them); the doctors are the starting list, which they can edit.
 */
export class SuggestFromTeamUseCase {
  constructor(
    private readonly plans: DailyPlanRepositoryPort,
    private readonly monthly: MonthlyPlanRepositoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly users: UserDirectoryPort,
    private readonly carryOver: CarryOver,
    private readonly scope: ManagerScope,
  ) {}

  async execute(managerId: string, planDate: string, userIds: string[]): Promise<TeamSuggestion> {
    if (!(await this.scope.isManager(managerId))) throw AppError.forbidden('Only a manager can plan the day with their team.');
    const ids = [...new Set(userIds)];
    await assertInDownline(this.users, managerId, ids, 'userIds');
    return this.forPeople(planDate, ids);
  }

  /** The suggestion for these people, without checking who is asking. */
  async forPeople(planDate: string, ids: string[]): Promise<TeamSuggestion> {
    const names = new Map((await this.users.getUserSummaries(ids)).map((u) => [u.id, u.name]));

    const people: TeamSuggestionPerson[] = [];
    for (const userId of ids) {
      const person = { userId, name: names.get(userId) ?? userId };
      const plan = await this.plans.findByUserAndDate(userId, planDate);
      if (plan) {
        const status = planStatus(await this.approvals.getForRecord('DAILY_PLAN', plan.id));
        people.push({ ...person, source: 'DAILY_PLAN', planStatus: status, routeIds: plan.routeIds, doctorIds: plan.doctors.map((d) => d.doctorId) });
        continue;
      }
      const entry = (await this.monthly.findByUserAndMonth(userId, planDate.slice(0, 7)))?.entries.find((e) => e.planDate === planDate);
      if (!entry || !isFieldDay(entry.workingType)) {
        people.push({ ...person, source: 'NONE', planStatus: null, routeIds: [], doctorIds: [] });
        continue;
      }
      const routes = new Set(entry.routeIds);
      const doctorIds = (await this.carryOver.directory().listAssignedDoctors(userId)).filter((d) => routes.has(d.routeId)).map((d) => d.id);
      people.push({ ...person, source: 'MONTHLY_PLAN', planStatus: null, routeIds: entry.routeIds, doctorIds });
    }
    return {
      planDate,
      people,
      routeIds: [...new Set(people.flatMap((p) => p.routeIds))],
      doctorIds: [...new Set(people.flatMap((p) => p.doctorIds))],
    };
  }
}
