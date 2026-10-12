import type { HolidayImportErrorDto } from '@greynote/contracts';
import { ApiError } from '@/lib/api/ApiError';

/** What an Admin can copy into a spreadsheet and fill in. Zones are names; an HQ is written Zone/HQ. */
export const HOLIDAY_CSV_TEMPLATE =
  'name,date,scope,zones,hqs\n' +
  'Republic Day,2027-01-26,NATIONAL,,\n' +
  'Onam,2027-09-11,ZONE,South,\n' +
  'Local fair,2027-03-05,HQ,,South/Kochi;South/Trivandrum\n';

export const MAX_HOLIDAY_FILE_BYTES = 1024 * 1024;

/** The per-line problems a refused file comes back with (`data.errors`), or the one message when it is something else. */
export function importProblems(error: unknown): HolidayImportErrorDto[] {
  if (!(error instanceof ApiError))
    return [{ line: 0, message: error instanceof Error ? error.message : 'Something went wrong.' }];
  const errors = (error.data as { errors?: unknown } | undefined)?.errors;
  if (Array.isArray(errors) && errors.length > 0) return errors as HolidayImportErrorDto[];
  return [{ line: 0, message: error.message }];
}

/** `null` when the file is acceptable to send. */
export function fileProblem(file: File): string | null {
  if (!/\.csv$/i.test(file.name)) return 'Choose a .csv file. In Excel: File → Save As → CSV.';
  if (file.size > MAX_HOLIDAY_FILE_BYTES) return 'That file is over 1 MB.';
  return null;
}
