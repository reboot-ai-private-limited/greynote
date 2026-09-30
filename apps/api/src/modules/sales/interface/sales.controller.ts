import type { Request, RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '@/shared/errors/AppError.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import { StockRefusal } from '../domain/stockRefusal.js';
import type { ListMissingStockUseCase, ListMonthlyStockUseCase } from '../application/usecases/readMonthlyStock.usecase.js';
import type { Actor, RecordMonthlyStockUseCase } from '../application/usecases/recordMonthlyStock.usecase.js';
import type { UnlockMonthUseCase } from '../application/usecases/unlockMonth.usecase.js';
import type { listMonthlyStockQuerySchema, missingQuerySchema, monthlyStockBodySchema, unlockBodySchema } from './sales.schemas.js';

function actorOf(req: Request): Actor {
  if (!req.user) throw AppError.unauthenticated();
  return { id: req.user.sub, role: req.user.role };
}

/** A refusal keeps its own code in the details so a client can tell "closed" from "not yours" without parsing text. */
async function refusing<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (!(err instanceof StockRefusal)) throw err;
    const details = { code: err.code };
    if (err.status === 403) throw AppError.forbidden(err.message);
    if (err.status === 404) throw AppError.notFound(err.message);
    if (err.status === 409) throw AppError.conflict(err.message, details);
    throw AppError.badRequest(err.message, details);
  }
}

export type SalesHandlers = Record<'recordStock' | 'listStock' | 'unlockMonth' | 'missingStock', RequestHandler>;

export function makeSalesControllers(u: {
  record: RecordMonthlyStockUseCase;
  list: ListMonthlyStockUseCase;
  unlock: UnlockMonthUseCase;
  missing: ListMissingStockUseCase;
}): SalesHandlers {
  return {
    recordStock: asyncHandler(async (req, res) => {
      const b = req.body as z.output<typeof monthlyStockBodySchema>;
      const result = await refusing(() => u.record.execute(actorOf(req), { outlet: { type: b.outletType, id: b.outletId }, month: b.month, lines: b.lines }));
      sendSuccess(req, res, result, 'The stock counts were saved.', 200);
    }),
    listStock: asyncHandler(async (req, res) => {
      const q = req.query as unknown as z.output<typeof listMonthlyStockQuerySchema>;
      const outlet = q.outletType && q.outletId ? { type: q.outletType, id: q.outletId } : undefined;
      sendSuccess(req, res, await u.list.execute(actorOf(req), { month: q.month, productId: q.productId, outlet }), 'Monthly stock counts.', 200);
    }),
    unlockMonth: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await u.unlock.execute(actorOf(req).id, (req.body as z.output<typeof unlockBodySchema>).month), 'The month is open for entry.', 200),
    ),
    missingStock: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await u.missing.execute(actorOf(req), (req.query as unknown as z.output<typeof missingQuerySchema>).month), 'Outlets with no stock count.', 200),
    ),
  };
}
