import type { DailyPlanRepositoryPort } from '../../domain/dailyPlan.repository.port.js';
import type { PlanPerson, UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { ManagerScope } from '../managerScope.js';

export interface WorkWithOption extends PlanPerson {
  /** The doctors on their approved plan that day: what the manager calls if they work with them. */
  doctorIds: string[];
}

/**
 * A manager's "Works with" for a day (2026-11-27): the people below them whose plan for that date is approved and goes to the manager's
 * To place, each with their planned doctors. Empty for an MR, for a day with no plan or no place, or when nobody qualifies.
 */
export class WorkWithOptionsUseCase {
  constructor(
    private readonly plans: Pick<DailyPlanRepositoryPort, 'findByUserAndDate'>,
    private readonly users: Pick<UserDirectoryPort, 'namePeople'>,
    private readonly scope: ManagerScope,
  ) {}

  async execute(ownerId: string, planDate: string): Promise<{ toPlaceId: string | null; people: WorkWithOption[] }> {
    const own = await this.plans.findByUserAndDate(ownerId, planDate);
    const toPlaceId = own?.toPlaceId ?? null;
    if (!(await this.scope.isManager(ownerId))) return { toPlaceId, people: [] };
    const team = await this.scope.teamAtPlace(ownerId, planDate, toPlaceId);
    const named = new Map((await this.users.namePeople(team.map((p) => p.userId))).map((p) => [p.id, p]));
    const people = team.flatMap((p) => {
      const person = named.get(p.userId);
      return person ? [{ ...person, doctorIds: p.doctors.map((d) => d.doctorId) }] : [];
    });
    return { toPlaceId, people: people.sort((a, b) => a.name.localeCompare(b.name)) };
  }
}
