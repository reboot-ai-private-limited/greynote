/**
 * The API speaks three date conventions — `YYYY-MM-DD` (hr, field-activity, planning), `YYYY-MM`
 * (sales, payroll) and ISO datetimes (approvals). Every "today" is computed in Asia/Kolkata, not in
 * the browser's own zone: a user on a laptop set to UTC would otherwise see yesterday for the first
 * five and a half hours of the Indian day.
 */
const TIME_ZONE = 'Asia/Kolkata';

/** `YYYY-MM-DD` in Indian time. (`en-CA` formats as ISO.) */
export function istDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** `YYYY-MM` in Indian time. */
export function istMonth(now: Date = new Date()): string {
  return istDate(now).slice(0, 7);
}

/** The month before a `YYYY-MM`. */
export function previousMonth(month: string): string {
  const [year = 0, mon = 1] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, mon - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** `YYYY-MM-DD` plus (or minus) whole days. */
export function addDays(date: string, days: number): string {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** How long ago, for a work-queue row: `just now`, `5h`, `3d`. */
export function ageLabel(iso: string, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return minutes < 1 ? 'just now' : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}
