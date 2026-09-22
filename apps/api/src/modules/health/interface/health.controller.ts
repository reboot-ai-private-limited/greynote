import type { Request, Response } from 'express';
import type { GetHealthUseCase } from '@/modules/health/application/usecases/getHealth.usecases';
import { asyncHandler } from '@/shared/http/asyncHandler';
import { sendSuccess } from '@/shared/http/response.util';

export function makeGetHealthController(useCase: GetHealthUseCase) {
    return asyncHandler(async (req: Request, res: Response) => {
        const report = await useCase.execute();

        // 503 Service Unavailable when degraded so load balancers know we are struggling!
        const statusCode = report.status === 'OK' ? 200 : 503;

        sendSuccess(req, res, report, 'Health check', statusCode);
    });
}
