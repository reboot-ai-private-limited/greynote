import { z } from 'zod';

/**
 * The checks for the first seed of a production database. Pure, so each refusal is tested; the script
 * (`seed-production.ts`) only gathers the facts and calls this.
 */

/** The database name in a MongoDB connection string: the path segment, e.g. `greynote-prod`. Null when there is none. */
export function databaseName(uri: string): string | null {
  const match = /^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]*)/.exec(uri.trim());
  const name = match?.[1] ? decodeURIComponent(match[1]) : '';
  return name || null;
}

export interface SeedFacts {
  nodeEnv: string;
  mongoUri: string;
  /** The value given to `--confirm-db=`. */
  confirmDb: string | undefined;
  /** How many users the target database already has. */
  existingUsers: number;
}

/** Returns why the seed must not run, or null when it may. */
export function refusalReason(facts: SeedFacts): string | null {
  if (facts.nodeEnv !== 'production') return 'NODE_ENV must be "production". (To rehearse, set it for this one run.)';
  const name = databaseName(facts.mongoUri);
  if (!name) return 'MONGO_URI has no database name. Add one, e.g. .../greynote-prod?...';
  if (!facts.confirmDb) return `Pass --confirm-db=${name} to say this is the database you mean.`;
  if (facts.confirmDb !== name) return `--confirm-db=${facts.confirmDb} does not match the database in MONGO_URI (${name}).`;
  if (facts.existingUsers > 0) return `The database "${name}" already has ${facts.existingUsers} user(s). This seed is only for an empty database.`;
  return null;
}

const adminSchema = z.object({
  ADMIN_CODE: z.string().trim().min(1),
  ADMIN_NAME: z.string().trim().min(1),
  ADMIN_EMAIL: z.string().trim().email(),
  ADMIN_PHONE: z.string().trim().min(1),
});

/** The first Admin's details from the environment; throws a readable list of what is missing. */
export function adminFromEnv(env: Record<string, string | undefined>) {
  const parsed = adminSchema.safeParse(env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => String(i.path[0])).join(', ');
    throw new Error(`Set these in the environment: ${missing}.`);
  }
  const { ADMIN_CODE, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PHONE } = parsed.data;
  return { employeeCode: ADMIN_CODE, name: ADMIN_NAME, email: ADMIN_EMAIL, phone: ADMIN_PHONE };
}

const paise = z.number().int().min(0);
const payBandsSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(20),
      taPerKmRatePaise: paise,
      hqDaPaise: paise,
      exStationDaPaise: paise,
      outStationDaPaise: paise,
    }),
  )
  .min(1);

export type SeedPayBand = z.infer<typeof payBandsSchema>[number];

/** The reviewed pay band file; refuses an empty list, a decimal amount or two bands with the same name. */
export function parsePayBands(json: unknown): SeedPayBand[] {
  const bands = payBandsSchema.parse(json);
  const keys = new Set<string>();
  for (const band of bands) {
    const key = band.name.trim().replace(/\s+/g, ' ').toLowerCase();
    if (keys.has(key)) throw new Error(`Pay band "${band.name}" appears twice.`);
    keys.add(key);
  }
  return bands;
}
