import { ThemedText } from '@/components/themed-text';
import { workingTypeLabel, type PlanDay } from '@/lib/planning';
import type { Colleague } from '@/offline/colleagues';

/** One planned day in a line of text: type, routes, who you work with, remarks. */
export function describeDay(
  day: PlanDay,
  names: { routes: Map<string, string>; colleagues: Map<string, Colleague> },
): string {
  const parts = [workingTypeLabel(day.workingType)];
  const routes = day.routeIds.map((id) => names.routes.get(id) ?? 'Route');
  if (routes.length > 0) parts.push(routes.join(', '));
  const people = day.workWith.map((id) => names.colleagues.get(id)?.name ?? 'Colleague');
  if (people.length > 0) parts.push(`with ${people.join(', ')}`);
  const base = parts.join(' · ');
  return day.remarks ? `${base} — ${day.remarks}` : base;
}

export function PlanDaySummary({ text }: { text: string }) {
  return (
    <ThemedText type="small" themeColor="textSecondary">
      {text}
    </ThemedText>
  );
}
