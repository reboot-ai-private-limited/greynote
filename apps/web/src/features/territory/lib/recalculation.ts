import type { RouteRecalculationDto } from '@greynote/contracts';

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** The most overridden routes named in a toast; the rest are counted. */
const NAMED = 3;

/**
 * What to tell an Admin after an HQ's base place changed. A route that could not be recalculated is an
 * error (TA on it is flagged until it is retried); routes kept on a hand-entered distance are named so
 * they get re-checked, but are not an error — leaving them alone was the point.
 */
export function describeRecalculation(report: RouteRecalculationDto | undefined): { message: string; tone: 'success' | 'error' } {
  if (!report) return { message: 'HQ updated.', tone: 'success' };
  const parts = ['HQ updated.'];
  const total = report.recalculated + report.failed;
  if (total === 0 && report.overridden.length === 0) parts.push('It has no active routes to recalculate.');
  if (report.recalculated > 0) parts.push(`${plural(report.recalculated, 'route')} recalculated from the new base place.`);
  if (report.failed > 0) {
    parts.push(`${plural(report.failed, 'route')} could not be recalculated — open each one and retry.`);
  }
  if (report.overridden.length > 0) {
    const names = report.overridden.slice(0, NAMED).map((r) => r.name);
    const more = report.overridden.length - names.length;
    parts.push(`Kept the manually entered distance on ${names.join(', ')}${more > 0 ? ` and ${more} more` : ''} — check ${report.overridden.length === 1 ? 'it' : 'them'}.`);
  }
  return { message: parts.join(' '), tone: report.failed > 0 ? 'error' : 'success' };
}
