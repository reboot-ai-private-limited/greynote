import { AppError } from '@/shared/errors/AppError.js';

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
