import type { Request, RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '@/shared/errors/AppError.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { requiredParam } from '@/shared/http/params.util.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import { PayrollRefusal } from '../domain/payrollRefusal.js';
import type { PayrollViews } from '../application/payrollViews.js';
import type { Actor, FinalizePayrollUseCase, GeneratePayrollUseCase, GetPayrollRunUseCase, ListMyPayslipsUseCase, ListPayrollRunsUseCase } from '../application/usecases/payroll.usecase.js';
import { payslipOf, type MyPayslipDto } from '@greynote/contracts';
import type { generateBodySchema, listRunsQuerySchema } from './payroll.schemas.js';

function actorOf(req: Request): Actor {
  if (!req.user) throw AppError.unauthenticated();
  return { id: req.user.sub, role: req.user.role };
}

/** A refusal keeps its own code in the details, so a client can tell them apart without parsing text. */
async function refusing<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (!(err instanceof PayrollRefusal)) throw err;
    const details = { code: err.code };
    if (err.status === 404) throw AppError.notFound(err.message);
    if (err.status === 409) throw AppError.conflict(err.message, details);
    throw AppError.badRequest(err.message, details);
  }
}

export type PayrollHandlers = Record<'generate' | 'finalize' | 'get' | 'list' | 'mine', RequestHandler>;

export function makePayrollControllers(u: { generate: GeneratePayrollUseCase; finalize: FinalizePayrollUseCase; get: GetPayrollRunUseCase; list: ListPayrollRunsUseCase; mine: ListMyPayslipsUseCase; views: PayrollViews }): PayrollHandlers {
  return {
    generate: asyncHandler(async (req, res) => {
      const b = req.body as z.output<typeof generateBodySchema>;
      sendSuccess(req, res, await u.views.outcomes(await refusing(() => u.generate.execute(actorOf(req), b))), 'The payroll sheet was generated.', 200);
    }),
    finalize: asyncHandler(async (req, res) => sendSuccess(req, res, await u.views.one(await refusing(() => u.finalize.execute(requiredParam(req.params, 'id')))), 'The payroll run is finalized.', 200)),
    get: asyncHandler(async (req, res) => sendSuccess(req, res, await u.views.one(await refusing(() => u.get.execute(requiredParam(req.params, 'id')))), 'The payroll run.', 200)),
    list: asyncHandler(async (req, res) => sendSuccess(req, res, await u.views.many(await u.list.execute(req.query as z.output<typeof listRunsQuerySchema>)), 'Payroll runs.', 200)),
    mine: asyncHandler(async (req, res) => {
      const runs = await u.mine.execute(actorOf(req).id, req.query as z.output<typeof listRunsQuerySchema>);
      const slips: MyPayslipDto[] = runs.map((r) => ({ id: r.id, month: r.month, finalizedAt: r.finalizedAt?.toISOString() ?? null, slip: payslipOf(r) }));
      sendSuccess(req, res, slips, 'Your payslips.', 200);
    }),
  };
}
