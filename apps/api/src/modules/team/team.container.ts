import type { Router } from 'express';
import { TeamClock } from './application/teamClock.js';
import { ListTeamMembersUseCase } from './application/usecases/listTeamMembers.usecase.js';
import { TeamLeavesUseCase } from './application/usecases/teamLeaves.usecase.js';
import { TeamMemberSummaryUseCase } from './application/usecases/teamMemberSummary.usecase.js';
import { TeamOrdersUseCase } from './application/usecases/teamOrders.usecase.js';
import { TeamStockUseCase } from './application/usecases/teamStock.usecase.js';
import { TeamPlansUseCase } from './application/usecases/teamPlans.usecase.js';
import { TeamTodayUseCase } from './application/usecases/teamToday.usecase.js';
import type {
  TeamBlockPort,
  TeamConfigPort,
  TeamDirectoryPort,
  TeamFieldActivityPort,
  TeamHrPort,
  TeamSalesPort,
  TeamMasterPort,
  TeamOverviewPort,
  TeamPlanningPort,
  TeamTerritoryPort,
} from './domain/ports.js';
import { makeTeamControllers } from './interface/team.controller.js';
import { buildTeamRouter } from './interface/team.route.js';

export interface TeamContainer {
  buildRouter: () => Router;
}

/**
 * A manager's view of their downline. Owns no data: it reads the modules that hold the work. Their public contracts are passed in
 * by the composition root.
 */
export function buildTeamContainer(
  identity: TeamDirectoryPort & TeamBlockPort,
  territory: TeamTerritoryPort,
  planning: TeamPlanningPort,
  fieldActivity: TeamFieldActivityPort,
  hr: TeamHrPort,
  config: TeamConfigPort,
  reports: TeamOverviewPort,
  sales: TeamSalesPort,
  master: TeamMasterPort,
): TeamContainer {
  const clock = new TeamClock(config);
  const members = new ListTeamMembersUseCase(identity, territory);
  const today = new TeamTodayUseCase(identity, identity, planning, fieldActivity, hr, clock);
  const plans = new TeamPlansUseCase(identity, planning);
  const leaves = new TeamLeavesUseCase(identity, hr);
  const orders = new TeamOrdersUseCase(identity, sales, master);
  const stock = new TeamStockUseCase(identity, sales);
  const summary = new TeamMemberSummaryUseCase(members, today, reports, clock);
  return {
    buildRouter: () =>
      buildTeamRouter(
        makeTeamControllers({ members, today, plans, leaves, summary, orders, stock }),
      ),
  };
}
