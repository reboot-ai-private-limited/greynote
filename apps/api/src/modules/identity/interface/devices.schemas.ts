import { z } from 'zod';

export const userDevicesParamsSchema = z.object({ id: z.string().min(1) });

export const userDeviceParamsSchema = z.object({
  id: z.string().min(1),
  deviceRowId: z.string().min(1),
});
