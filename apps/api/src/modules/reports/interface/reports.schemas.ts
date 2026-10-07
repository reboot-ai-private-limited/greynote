import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id.');

export const ordersQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM.'),
  type: z.enum(['DISTRIBUTOR', 'CHEMIST']).optional(),
  status: z.enum(['PLACED', 'DONE', 'CANCELLED']).optional(),
  mrId: objectId.optional(),
});
export const orderIdParamsSchema = z.object({ id: objectId });
