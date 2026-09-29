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

const kindSchema = z.string().trim().min(1).max(60).regex(/^[A-Z][A-Z0-9_]*$/, 'A kind is UPPER_SNAKE_CASE.');
const timeSchema = z.string().datetime({ offset: true, message: 'Must be a date-time with a timezone.' }).transform((s) => new Date(s));

/** A draft to keep, or `deleted: true` for one the MR removed (a removal needs no kind or payload). */
export const putDraftsBodySchema = z.object({
  drafts: z
    .array(
      z
        .object({
          clientId: clientIdSchema,
          clientUpdatedAt: timeSchema,
          deleted: z.boolean().default(false),
          kind: kindSchema.optional(),
          payload: z.unknown().optional(),
        })
        .superRefine((d, ctx) => {
          if (!d.deleted && d.kind === undefined) ctx.addIssue({ code: 'custom', path: ['kind'], message: 'A draft needs a kind.' });
        })
        .transform((d) =>
          d.deleted
            ? ({ clientId: d.clientId, clientUpdatedAt: d.clientUpdatedAt, deleted: true } as const)
            : ({ clientId: d.clientId, clientUpdatedAt: d.clientUpdatedAt, deleted: false, kind: d.kind!, payload: d.payload ?? null } as const),
        ),
    )
    .min(1, 'Send at least one draft.')
    .max(1_000),
});

export const listDraftsQuerySchema = z.object({
  /** The `nextCursor` of the previous page. */
  after: z.string().regex(/^[a-f\d]{24}$/i, 'Must be a cursor from the previous page.').optional(),
  limit: z.coerce.number().int().positive().max(200).default(100),
});

/**
 * `GET /pull?v[fieldMasterData]=<version>&v[hr]=<version>&only=hr,territory` — the version the phone holds
 * for each source (a SHA-1), and optionally which sources it wants; all of them by default.
 */
export const pullQuerySchema = z.object({
  v: z.record(z.string().regex(/^[a-f0-9]{40}$/, 'Must be a version from an earlier pull.')).default({}),
  only: z
    .string()
    .transform((s) => s.split(',').map((n) => n.trim()).filter(Boolean))
    .optional(),
});
