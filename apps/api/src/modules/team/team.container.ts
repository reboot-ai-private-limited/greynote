import type { Router } from 'express';
import { TeamAlerts } from './application/teamAlerts.js';
import { MongoAlertMarksAdapter } from './infrastructure/mongoAlertMarks.adapter.js';
import { TeamClock } from './application/teamClock.js';
import { ListTeamMembersUseCase } from './application/usecases/listTeamMembers.usecase.js';
import { TeamLeavesUseCase } from './application/usecases/teamLeaves.usecase.js';
import { TeamMemberSummaryUseCase } from './application/usecases/teamMemberSummary.usecase.js';
import { TeamOrdersUseCase } from './application/usecases/teamOrders.usecase.js';
import { TeamExpensesUseCase } from './application/usecases/teamExpenses.usecase.js';
import { TeamStockUseCase } from './application/usecases/teamStock.usecase.js';
import { TeamPlansUseCase } from './application/usecases/teamPlans.usecase.js';
import { TeamDoctorUseCase, TeamMemberDoctorsUseCase } from './application/usecases/teamDoctors.usecase.js';
import { TeamMemberAttendanceUseCase } from './application/usecases/teamMemberAttendance.usecase.js';
import { TeamMemberDaysUseCase } from './application/usecases/teamMemberDays.usecase.js';
import { TeamDayUseCase } from './application/usecases/teamDay.usecase.js';
import { TeamTodayUseCase } from './application/usecases/teamToday.usecase.js';
import type {
  TeamApprovalPort,
  TeamAttendancePort,
  TeamBlockPort,
  TeamConfigPort,
  TeamDirectoryPort,
  TeamFieldActivityPort,
  TeamHrPort,
  TeamInboxPort,
  TeamSalesPort,
  TeamMasterPort,
  TeamOverviewPort,
  TeamPeoplePort,
  TeamPlanningPort,
  TeamRoutesPort,
  TeamTerritoryPort,
} from './domain/ports.js';
import { makeTeamControllers } from './interface/team.controller.js';
import { buildTeamRouter } from './interface/team.route.js';

export interface TeamContainer {
  buildRouter: () => Router;
  /** Tells managers about new leave, expenses and new-doctor requests and about overdue ones. Run every few minutes; safe from several servers. */
  runAlerts: () => ReturnType<TeamAlerts['runWaiting']>;
  /** Tells the managers of people the missed-report job has just blocked. */
  notifyBlocked: TeamAlerts['notifyBlocked'];
}

/**
 * A manager's view of their downline. Owns no data: it reads the modules that hold the work. Their public contracts are passed in
 * by the composition root.
 */
export function buildTeamContainer(
  identity: TeamDirectoryPort & TeamBlockPort,
  territory: TeamTerritoryPort & TeamRoutesPort,
  planning: TeamPlanningPort,
  fieldActivity: TeamFieldActivityPort,
  hr: TeamHrPort,
  config: TeamConfigPort,
  reports: TeamOverviewPort,
  sales: TeamSalesPort,
  master: TeamMasterPort,
  approvals: TeamApprovalPort,
  inbox: TeamInboxPort,
  people: TeamPeoplePort,
  attendance: TeamAttendancePort,
): TeamContainer {
  const clock = new TeamClock(config);
  const members = new ListTeamMembersUseCase(identity, territory);
  const today = new TeamTodayUseCase(identity, identity, planning, territory, fieldActivity, hr, clock);
  const plans = new TeamPlansUseCase(identity, planning, territory, master);
  const memberDays = new TeamMemberDaysUseCase(identity, planning, territory, fieldActivity, master, clock);
  const memberAttendance = new TeamMemberAttendanceUseCase(identity, attendance);
  const memberDoctors = new TeamMemberDoctorsUseCase(identity, master, fieldActivity, territory, planning);
  const doctor = new TeamDoctorUseCase(identity, master, fieldActivity, territory);
  const day = new TeamDayUseCase(identity, planning, territory, fieldActivity, hr, sales, master, clock);
  const leaves = new TeamLeavesUseCase(identity, hr);
  const orders = new TeamOrdersUseCase(identity, sales, master);
  const stock = new TeamStockUseCase(identity, sales);
  const expenses = new TeamExpensesUseCase(identity, fieldActivity);
  const summary = new TeamMemberSummaryUseCase(members, today, reports, clock);
  const alerts = new TeamAlerts(approvals, people, inbox, new MongoAlertMarksAdapter(), config);
  return {
    buildRouter: () =>
      buildTeamRouter(
        makeTeamControllers({ members, today, plans, day, memberDays, memberAttendance, memberDoctors, doctor, leaves, summary, orders, stock, expenses }),
      ),
    runAlerts: () => alerts.runWaiting(),
    notifyBlocked: (blocked) => alerts.notifyBlocked(blocked),
  };
}
