import type { Request, RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '@/shared/errors/AppError.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import type { ListTeamMembersUseCase } from '../application/usecases/listTeamMembers.usecase.js';
import type { TeamMemberSummaryUseCase } from '../application/usecases/teamMemberSummary.usecase.js';
import type { TeamLeavesUseCase } from '../application/usecases/teamLeaves.usecase.js';
import type { TeamOrdersUseCase } from '../application/usecases/teamOrders.usecase.js';
import type { TeamExpensesUseCase } from '../application/usecases/teamExpenses.usecase.js';
import type { TeamStockUseCase } from '../application/usecases/teamStock.usecase.js';
import type { TeamDoctorUseCase, TeamMemberDoctorsUseCase } from '../application/usecases/teamDoctors.usecase.js';
import type { TeamMemberAttendanceUseCase } from '../application/usecases/teamMemberAttendance.usecase.js';
import type { TeamMemberDaysUseCase } from '../application/usecases/teamMemberDays.usecase.js';
import type { TeamDayUseCase } from '../application/usecases/teamDay.usecase.js';
import type { TeamPlansUseCase } from '../application/usecases/teamPlans.usecase.js';
import type { TeamTodayUseCase } from '../application/usecases/teamToday.usecase.js';
import type {
  leavesQuerySchema,
  memberParamsSchema,
  membersQuerySchema,
  ordersQuerySchema,
  stockQuerySchema,
  expensesQuerySchema,
  dayQuerySchema,
  doctorParamsSchema,
  daysQuerySchema,
  plansQuerySchema,
  summaryQuerySchema,
  todayQuerySchema,
} from './team.schemas.js';

const callerId = (req: Request): string => {
  if (!req.user) throw AppError.unauthenticated();
  return req.user.sub;
};
/** `validate()` has already parsed the query into its schema's output. */
const query = <S extends z.ZodTypeAny>(req: Request): z.output<S> =>
  req.query as unknown as z.output<S>;

export type TeamHandlers = Record<
  'members' | 'summary' | 'memberDays' | 'memberAttendance' | 'memberDoctors' | 'doctor' | 'today' | 'day' | 'plans' | 'leaves' | 'orders' | 'stock' | 'expenses',
  RequestHandler
>;

export function makeTeamControllers(u: {
  members: ListTeamMembersUseCase;
  today: TeamTodayUseCase;
  plans: TeamPlansUseCase;
  day: TeamDayUseCase;
  memberDays: TeamMemberDaysUseCase;
  memberAttendance: TeamMemberAttendanceUseCase;
  memberDoctors: TeamMemberDoctorsUseCase;
  doctor: TeamDoctorUseCase;
  leaves: TeamLeavesUseCase;
  summary: TeamMemberSummaryUseCase;
  orders: TeamOrdersUseCase;
  stock: TeamStockUseCase;
  expenses: TeamExpensesUseCase;
}): TeamHandlers {
  return {
    members: asyncHandler(async (req, res) =>
      sendSuccess(
        req,
        res,
        await u.members.execute(callerId(req), query<typeof membersQuerySchema>(req)),
        'Your team.',
        200,
      ),
    ),
    summary: asyncHandler(async (req, res) => {
      const { id } = req.params as unknown as z.output<typeof memberParamsSchema>;
      sendSuccess(
        req,
        res,
        await u.summary.execute(callerId(req), id, query<typeof summaryQuerySchema>(req).month),
        'Team member.',
        200,
      );
    }),
    orders: asyncHandler(async (req, res) =>
      sendSuccess(
        req,
        res,
        await u.orders.execute(callerId(req), query<typeof ordersQuerySchema>(req)),
        'Your team’s orders.',
        200,
      ),
    ),
    expenses: asyncHandler(async (req, res) =>
      sendSuccess(
        req,
        res,
        await u.expenses.execute(callerId(req), query<typeof expensesQuerySchema>(req)),
        'Your team’s expenses.',
        200,
      ),
    ),
    stock: asyncHandler(async (req, res) =>
      sendSuccess(
        req,
        res,
        await u.stock.execute(callerId(req), query<typeof stockQuerySchema>(req)),
        'Your team’s stock and secondary.',
        200,
      ),
    ),
    today: asyncHandler(async (req, res) =>
      sendSuccess(
        req,
        res,
        await u.today.execute(callerId(req), query<typeof todayQuerySchema>(req)),
        'Your team’s day.',
        200,
      ),
    ),
    memberDays: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await u.memberDays.execute(callerId(req), (req.params as unknown as z.output<typeof memberParamsSchema>).id, query<typeof daysQuerySchema>(req).month), 'Their days.', 200),
    ),
    memberAttendance: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await u.memberAttendance.execute(callerId(req), (req.params as unknown as z.output<typeof memberParamsSchema>).id, query<typeof daysQuerySchema>(req).month), 'Their attendance.', 200),
    ),
    memberDoctors: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await u.memberDoctors.execute(callerId(req), (req.params as unknown as z.output<typeof memberParamsSchema>).id, query<typeof daysQuerySchema>(req).month), 'Their doctors.', 200),
    ),
    doctor: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await u.doctor.execute(callerId(req), (req.params as unknown as z.output<typeof doctorParamsSchema>).id, query<typeof daysQuerySchema>(req).month), 'The doctor.', 200),
    ),
    day: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await u.day.execute(callerId(req), query<typeof dayQuerySchema>(req)), 'Your team’s board for the day.', 200),
    ),
    plans: asyncHandler(async (req, res) =>
      sendSuccess(
        req,
        res,
        await u.plans.execute(callerId(req), query<typeof plansQuerySchema>(req)),
        'Your team’s plans.',
        200,
      ),
    ),
    leaves: asyncHandler(async (req, res) =>
      sendSuccess(
        req,
        res,
        await u.leaves.execute(callerId(req), query<typeof leavesQuerySchema>(req)),
        'Your team’s leave.',
        200,
      ),
    ),
  };
}
