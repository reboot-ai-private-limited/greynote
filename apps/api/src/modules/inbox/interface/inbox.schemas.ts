import { ROLE_NAMES } from '@greynote/contracts';
import { z } from 'zod';
import { INBOX_KINDS } from '../domain/inboxMessage.entity.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id.');
const pageFields = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
};

export const idParamsSchema = z.object({ id: objectIdSchema });
export const myInboxQuerySchema = z.object({
  ...pageFields,
  // `z.coerce.boolean()` would turn the string "false" into true.
  unread: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
});
export const sentQuerySchema = z.object(pageFields);

/**
 * JSON, or the `payload` field of a multipart request that also carries `files`. The body has no length limit of its
 * own (2026-10-22): only the request's (2 MB of text) stops it. The title stays short, a heading on a phone.
 */
export const publishBodySchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1),
  kind: z.enum(INBOX_KINDS),
  audience: z.object({
    everyone: z.boolean().default(false),
    roles: z.array(z.enum(ROLE_NAMES)).max(ROLE_NAMES.length).default([]),
    zoneIds: z.array(objectIdSchema).max(50).default([]),
    hqIds: z.array(objectIdSchema).max(200).default([]),
    userIds: z.array(objectIdSchema).max(500).default([]),
  }),
  expiresAt: z.coerce.date().optional(),
});
