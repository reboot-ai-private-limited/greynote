import { AppError } from '@/shared/errors/AppError.js';
import { assertTimeZone } from '@/shared/time/businessTime.js';

/** Any module's narrow view of Config — `config.contract` satisfies it structurally. */
export interface ConfigReader {
  get(key: string): Promise<string>;
}

/**
 * Reads and parses one Config value. Config doesn't validate values on write, so a malformed one
 * surfaces here as a fault naming its key — never silently as a default.
 */
export async function readConfig<T>(config: ConfigReader, key: string, parse: (value: string) => T): Promise<T> {
  const value = await config.get(key);
  try {
    return parse(value);
  } catch (err) {
    throw AppError.internal('INTERNAL', { reason: 'CONFIG_VALUE_INVALID', key, value }, err);
  }
}

/**
 * Like `readConfig`, but a key the database doesn't have yet (not re-seeded since the setting was added) reads as `fallback` — the
 * seeded default — instead of a fault. A stored value that is present but malformed still surfaces as a fault naming its key.
 */
export async function readConfigOr<T>(config: ConfigReader, key: string, parse: (value: string) => T, fallback: T): Promise<T> {
  try {
    return await readConfig(config, key, parse);
  } catch (err) {
    if (err instanceof AppError && (err.details as { reason?: string } | undefined)?.reason === 'CONFIG_KEY_MISSING') return fallback;
    throw err;
  }
}

export function parseBoolean(value: string): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new RangeError(`Not true/false: ${value}`);
}

export function parsePositiveInt(max: number) {
  return (value: string): number => {
    const n = Number(value);
    if (!/^\d+$/.test(value) || n < 1 || n > max) throw new RangeError(`Not a whole number from 1 to ${max}: ${value}`);
    return n;
  };
}

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * `DAY_START_TIME` (`HH:mm`): when the business day rolls over. A database that hasn't been re-seeded since the setting was added has
 * no such key, and there midnight (the old behaviour) is the right answer, not a fault. A stored value that is present but malformed
 * still surfaces as a fault naming the key.
 */
export async function readDayStart(config: ConfigReader): Promise<string> {
  let value: string;
  try {
    value = await config.get('DAY_START_TIME');
  } catch (err) {
    if (err instanceof AppError && (err.details as { reason?: string } | undefined)?.reason === 'CONFIG_KEY_MISSING') return '00:00';
    throw err;
  }
  if (!value) return '00:00'; // present but blank = not set
  if (!TIME_OF_DAY.test(value)) throw AppError.internal('INTERNAL', { reason: 'CONFIG_VALUE_INVALID', key: 'DAY_START_TIME', value });
  return value;
}

/** The business timezone and the day start together: everything a clock needs to turn an instant into a business day. */
export async function readBusinessDay(config: ConfigReader): Promise<{ timeZone: string; dayStart: string }> {
  const timeZone = await readConfig(config, 'BUSINESS_TIMEZONE', (v) => {
    assertTimeZone(v);
    return v;
  });
  return { timeZone, dayStart: await readDayStart(config) };
}
