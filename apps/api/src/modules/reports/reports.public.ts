export type {
  TeamOverviewDto,
  TeamOverviewInput,
  TeamOverviewRow,
  TeamAttendanceCounts,
} from './application/teamOverviewReport.js';
import type { TeamOverviewDto, TeamOverviewInput } from './application/teamOverviewReport.js';

/** The only thing another module may import from `reports/`. Read-only; reports own no data. */
export interface ReportsPublicContract {
  /** A manager's month at a glance (or Admin's), one row per person in scope — what `GET /reports/team/overview` returns. */
  readTeamOverview(input: TeamOverviewInput): Promise<TeamOverviewDto>;
}
