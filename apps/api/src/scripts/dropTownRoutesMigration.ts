/** A route as the migration reads it. */
export interface DropRoute {
  id: string;
  name: string;
  fromPlaceId: string | null;
  toPlaceId: string | null;
  status: string;
}
export interface DropOutlet {
  id: string;
  routeId: string | null;
}

/**
 * What `migrate:drop-town-routes` does (2026-11-27): every route whose two ends are the same place ("SILIGURI to SILIGURI") is deleted — a
 * day at one place needs no route, and an HQ place pays no TA either way. Doctors and chemists whose old `routeId` is such a route are
 * moved to another active route touching that place (first by name — what `anchorRouteForPlace` falls back to), or left as they are when
 * there is none (they are served by their place; old phone builds alone read `routeId`).
 */
export function planDropTownRoutes(input: { routes: readonly DropRoute[]; doctors: readonly DropOutlet[]; chemists: readonly DropOutlet[] }) {
  const self = input.routes.filter((r) => r.fromPlaceId !== null && r.fromPlaceId === r.toPlaceId);
  const placeOf = new Map(self.map((r) => [r.id, r.fromPlaceId as string]));
  const replacement = new Map<string, string | null>();
  for (const r of self) {
    const place = r.fromPlaceId as string;
    const next = input.routes
      .filter((o) => o.status === 'active' && !placeOf.has(o.id) && (o.fromPlaceId === place || o.toPlaceId === place))
      .sort((a, b) => a.name.localeCompare(b.name))[0];
    replacement.set(r.id, next?.id ?? null);
  }
  const moves = (outlets: readonly DropOutlet[]) =>
    outlets.flatMap((o) => {
      const to = o.routeId ? replacement.get(o.routeId) : undefined;
      return to ? [{ id: o.id, routeId: to }] : [];
    });
  const stuck = (outlets: readonly DropOutlet[]) => outlets.filter((o) => o.routeId !== null && replacement.get(o.routeId) === null).length;
  return {
    routes: self.map((r) => ({ id: r.id, name: r.name })),
    doctors: moves(input.doctors),
    chemists: moves(input.chemists),
    leftOnOldRoute: stuck(input.doctors) + stuck(input.chemists),
  };
}
