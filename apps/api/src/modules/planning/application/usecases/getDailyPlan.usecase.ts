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
   * (a doctor that is not there any more reads "Removed doctor").
   */
  async execute(actor: Actor, planId: string): Promise<Omit<DailyPlanView, 'doctors'> & { doctors: Array<PlannedDoctor & { name: string }>; routes: PlanRoute[]; workWithPeople: PlanPerson[] }> {
    const plan = await this.plans.findById(planId);
    if (!plan) throw AppError.notFound('No such plan.');
    await assertCanRead(this.users, actor, plan.userId);
    const [view, routes, peopleOf] = await Promise.all([
      this.views.daily(plan),
      namePlanRoutes(this.routes, plan.routeIds),
      makePlanPeopleNamer(this.users, [plan]),
    ]);
    const names = new Map((await this.doctorDirectory().getDoctorNames(plan.doctors.map((d) => d.doctorId))).map((d) => [d.id, d.name]));
    const doctors = plan.doctors.map((d) => ({ ...d, name: names.get(d.doctorId) ?? 'Removed doctor' }));
    return { ...withPeople(view, peopleOf), doctors, routes };
  }
}
