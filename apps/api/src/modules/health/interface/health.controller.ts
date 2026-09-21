import type { Request, Response } from 'express';
import type { GetHealthUseCase } from '@/modules/health/application/usecases/getHealth.usecases';

export function makeGetHealthController(useCase: GetHealthUseCase) {
    // We return an Express RequestHandler function
    return async (req: Request, res: Response) => {
        try {
            // 1. Call the business logic
            const report = await useCase.execute();

            // 2. Translate the response to HTTP
            // 503 Service Unavailable when degraded so load balancers know we are struggling!
            const statusCode = report.status === 'OK' ? 200 : 503;

            res.status(statusCode).json(report);
        } catch (error) {
            res.status(500).json({ status: 'DEGRADED', detail: 'Internal Server Error' });
        }
    };
}
