/** What the Tour Plan CSV needs of a route: its id and name. */
type RouteName = { id: string; name: string };

/**
 * A route is named "From to To" ("slg-1 to bagdogra"): this reads the two ends off the name. A name without " to " has no From, and the
 * whole name is the To.
 */
export function routeFromTo(name: string): { from: string; to: string } {
  const m = /^(.+?)\s+to\s+(.+)$/i.exec(name.trim());
  return m ? { from: m[1]!.trim(), to: m[2]!.trim() } : { from: '', to: name.trim() };
}

/**
 * The From and To of a day's routes, one per route in the order chosen, joined with "; ". A route with no From shows "-" when another
 * route of the day has one; when none has, the From is empty. A route that is no longer on the list is left out.
 */
export function fromToOf(routeIds: string[], routes: RouteName[] | undefined): { from: string; to: string } {
  const byId = new Map((routes ?? []).map((r) => [r.id, r]));
  const ends = routeIds.map((id) => byId.get(id)).filter((r): r is RouteName => r !== undefined).map((r) => routeFromTo(r.name));
  const anyFrom = ends.some((e) => e.from !== '');
  return { from: anyFrom ? ends.map((e) => e.from || '-').join('; ') : '', to: ends.map((e) => e.to).join('; ') };
}
