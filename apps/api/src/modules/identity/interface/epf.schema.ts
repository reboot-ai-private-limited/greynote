import { z } from 'zod';

/** An EPF member id: regions format them differently, so only the characters and the length are checked. Stored upper-case. */
export const epfSchema = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9/-]{1,30}$/, 'The EPF number is 1 to 30 letters, digits, / or -.'));
