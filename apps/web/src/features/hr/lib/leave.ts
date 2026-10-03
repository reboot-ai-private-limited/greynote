// How a leave is described, shared by the HR screens and the approval preview.

/** `3 Oct 2026` for one day, `3 – 5 Oct 2026` within a month, otherwise both ends in full. Dates arrive as `YYYY-MM-DD`. */
export function leaveRangeLabel(start: string, end: string, half: string | null): string {
  const fmt = (iso: string, withYear: boolean, withMonth = true) =>
    new Intl.DateTimeFormat('en-IN', {
      timeZone: 'UTC',
      day: 'numeric',
      ...(withMonth && { month: 'short' }),
      ...(withYear && { year: 'numeric' }),
    }).format(new Date(`${iso}T00:00:00Z`));
  if (start === end) {
    const day = fmt(start, true);
    return half ? `${day} (${half === 'FIRST' ? 'first half' : 'second half'})` : day;
  }
  if (start.slice(0, 7) === end.slice(0, 7)) return `${fmt(start, false, false)} – ${fmt(end, true)}`;
  return `${fmt(start, true)} – ${fmt(end, true)}`;
}

/** `1 day`, `2.5 days`. */
export function daysLabel(n: number): string {
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}
