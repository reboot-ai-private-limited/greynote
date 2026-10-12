import { z } from 'zod';
import { COMPANY_DOCUMENT_CATEGORIES } from '../domain/companyDocument.entity.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id.');

export const idParamsSchema = z.object({ id: objectIdSchema });
/** Multipart: the file goes in `file`; `userIds` is a JSON array or comma-separated ids, empty for everyone. */
export const uploadBodySchema = z.object({
  title: z.string().trim().min(1).max(120),
  category: z.enum(COMPANY_DOCUMENT_CATEGORIES),
  userIds: z
    .union([z.array(objectIdSchema), z.string()])
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === '') return [] as string[];
      const list = Array.isArray(v) ? v : v.trim().startsWith('[') ? safeJson(v) : v.split(',').map((s) => s.trim()).filter(Boolean);
      const parsed = z.array(objectIdSchema).max(500).safeParse(list);
      if (!parsed.success) {
        ctx.addIssue({ code: 'custom', message: 'userIds must be valid ids.' });
        return z.NEVER;
      }
      return parsed.data;
    }),
});

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
