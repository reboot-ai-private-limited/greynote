import { AppError } from '@/shared/errors/AppError.js';
import type { DailyPlanRepositoryPort } from '../../domain/dailyPlan.repository.port.js';
import type { DoctorDirectoryPort } from '../../domain/doctorDirectory.port.js';
import type { PlanRoute, RouteDirectoryPort } from '../../domain/routeDirectory.port.js';
import type { PlanPerson, UserDirectoryPort } from '../../domain/userDirectory.port.js';
import { assertCanRead, type Actor } from '../planAccess.js';
import { makePlanPeopleNamer, withPeople } from '../planPeople.js';
import { namePlanRoutes } from '../planRoutes.js';
import type { PlannedDoctor } from '../../domain/plan.js';
import type { DailyPlanView, PlanViews } from '../planViews.js';

export class GetDailyPlanUseCase {
  constructor(
    private readonly plans: DailyPlanRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly views: PlanViews,
    private readonly routes: RouteDirectoryPort,
    /** Bound after the containers are built, so it is asked for on each read. */
    private readonly doctorDirectory: () => DoctorDirectoryPort,
  ) {}

  /**
   * `routes`: the plan's routes named and typed, for a reader (a manager) who doesn't hold them. `workWithPeople`: the
   * colleagues of `workWith`, as `Name (Designation)`. `doctors`: each doctor to call with their name, so a reviewer reads who is planned
   * (a doctor that is not there any more reads "Removed doctor"), and `plannedBy`: which of the work-with people planned them, for a
   * manager's day, whose doctors are theirs (2026-11-28; null when the doctor is on nobody's plan, e.g. an MR's own day).
   */
  async execute(actor: Actor, planId: string): Promise<Omit<DailyPlanView, 'doctors'> & { doctors: Array<PlannedDoctor & { name: string; plannedBy: PlanPerson | null }>; routes: PlanRoute[]; workWithPeople: PlanPerson[] }> {
    const plan = await this.plans.findById(planId);
    if (!plan) throw AppError.notFound('No such plan.');
    await assertCanRead(this.users, actor, plan.userId);
    const [view, routes, peopleOf] = await Promise.all([
      this.views.daily(plan),
      namePlanRoutes(this.routes, plan.routeIds),
      makePlanPeopleNamer(this.users, [plan]),
    ]);
    const names = new Map((await this.doctorDirectory().getDoctorNames(plan.doctors.map((d) => d.doctorId))).map((d) => [d.id, d.name]));
    // Who planned each doctor, among the people this day is spent with (their own plans for the same date).
    const plannedBy = new Map<string, PlanPerson>();
    if (plan.workWith.length > 0) {
      const people = new Map(peopleOf(plan.workWith).map((p) => [p.id, p]));
      for (const theirs of await this.plans.listForUsersOnDate(plan.workWith, plan.planDate)) {
        const person = people.get(theirs.userId);
        if (person) for (const d of theirs.doctors) if (!plannedBy.has(d.doctorId)) plannedBy.set(d.doctorId, person);
      }
    }
    const doctors = plan.doctors.map((d) => ({ ...d, name: names.get(d.doctorId) ?? 'Removed doctor', plannedBy: plannedBy.get(d.doctorId) ?? null }));
    return { ...withPeople(view, peopleOf), doctors, routes };
  }
}
