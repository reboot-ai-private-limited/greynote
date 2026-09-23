import type { RequestHandler } from 'express';
import type { GetHealthUseCase } from '../application/usecases/getHealth.usecases.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { sendSuccess } from '@/shared/http/response.util.js';

export function makeGetHealthController(useCase: GetHealthUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    const report = await useCase.execute();

    // 503 when degraded so load balancers know we are struggling. Still a "success"
    // response, just not a 200 — the health module answered, it just doesn't like what it
    // found. A thrown error (unexpected) is handled by the global error handler via
    // asyncHandler, not here.
    const statusCode = report.status === 'OK' ? 200 : 503;
    sendSuccess(req, res, report, 'Health check complete', statusCode);
  });
}
