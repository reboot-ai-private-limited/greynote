import { z } from 'zod';

const clientIdSchema = z.string().uuid('Must be a UUID.');

export const pushBodySchema = z.object({
  // The real cap is `SYNC_MAX_BATCH` (config); this only bounds what we'll parse at all.
  records: z
    .array(
      z.object({
        clientId: clientIdSchema,
        kind: z.string().trim().min(1).max(60).regex(/^[A-Z][A-Z0-9_]*$/, 'A kind is UPPER_SNAKE_CASE.'),
        dependsOn: z.array(clientIdSchema).max(500).default([]),
        clientCreatedAt: z.string().datetime({ offset: true, message: 'Must be a date-time with a timezone.' }).transform((s) => new Date(s)),
        payload: z.unknown(),
      }),
    )
    .min(1, 'Send at least one record.')
    .max(10_000),
});
