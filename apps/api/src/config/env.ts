import 'dotenv/config';
import { z } from 'zod';

/**
 * Every environment variable the API reads, validated once at boot.
 *
 * Parsing here rather than reaching for `process.env` at the call site means a missing or
 * malformed variable fails the process on startup with a message naming the variable — instead
 * of surfacing as `undefined` inside a Mongo connection string an hour into a deploy.
 *
 * `MONGO_URI` is required as of the `identity` module (docs/roadmap.md phase 1) — it's the first
 * Mongoose-backed module.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  MONGO_URI: z.string().min(1),

  /** Comma-separated list of allowed browser origins, for the `cors` middleware. */
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((value) => value.split(',').map((origin) => origin.trim())),

  // Separate signing secrets by design — a leaked access-token secret must not also let someone
  // forge refresh tokens. See docs/decision-log.md.
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  BCRYPT_COST_FACTOR: z.coerce.number().int().min(10).max(15).default(12),

  /**
   * Backs Identity's document-upload endpoint. Optional at boot — every other route works fine
   * without it — and only actually required the moment `POST /users/:id/documents` is called;
   * that request fails with a clear error if these are unset, rather than the whole process
   * refusing to start over a feature most requests never touch.
   */
  CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
  CLOUDINARY_API_KEY: z.string().min(1).optional(),
  CLOUDINARY_API_SECRET: z.string().min(1).optional(),

  /**
   * Territory's place search and route distance (Places API (New) + Routes API). Optional at
   * boot, like Cloudinary: without it place search answers 503 and routes save as `FAILED`.
   */
  GOOGLE_MAPS_API_KEY: z.string().min(1).optional(),

  /**
   * Firebase service-account key (the whole JSON file, on one line) for push notifications. Optional at boot, like
   * Cloudinary: without it nothing is pushed and the Inbox keeps working. Never commit it.
   */
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().min(1).optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // Not the logger: the logger reads LOG_LEVEL from this very object, so it may not exist yet.
  const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`Invalid environment:\n${issues}`);
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const isDevelopment = env.NODE_ENV === 'development';
