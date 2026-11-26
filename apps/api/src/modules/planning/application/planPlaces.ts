import { AppError } from '@/shared/errors/AppError.js';
import { isFieldDay, type PlanDay } from '../domain/plan.js';
import type { RouteDirectoryPort } from '../domain/routeDirectory.port.js';

/**
 * A field day is one From → To along a route Admin typed (decision-log 2026-11-26). This fills in what the other half of a day implies:
 * - From and To given: the route between them, kept as the day's route (none when From = To, a day spent at one place). No route between
 *   them is refused: the day can't be planned until Admin adds one.
 * - From and To missing but exactly one route (an older phone): that route's two places.
 * Anything else is left for `assertPlanDay` and `PlanSubmitter.validateDays` to judge.
 */
export class PlanPlaces {
  constructor(private readonly routes: Pick<RouteDirectoryPort, 'findRouteBetween' | 'getRoute'>) {}

  async normalize<T extends PlanDay>(day: T, field = ''): Promise<T> {
    if (!isFieldDay(day.workingType)) return day;
    if (day.fromPlaceId && day.toPlaceId) {
      if (day.fromPlaceId === day.toPlaceId) return { ...day, routeIds: [] };
      const route = await this.routes.findRouteBetween(day.fromPlaceId, day.toPlaceId);
      if (!route) {
        throw AppError.badRequest('There is no route between these two places. Ask Admin to add one under Territory → Routes.', { field: `${field}toPlaceId` });
      }
      if (route.status !== 'active') throw AppError.conflict('The route between these two places is inactive.', { field: `${field}toPlaceId` });
      return { ...day, routeIds: [route.id] };
    }
    if (!day.fromPlaceId && !day.toPlaceId && day.routeIds.length === 1) {
      const route = await this.routes.getRoute(day.routeIds[0]!);
      if (route?.fromPlaceId && route.toPlaceId) return { ...day, fromPlaceId: route.fromPlaceId, toPlaceId: route.toPlaceId };
    }
    return day;
  }

  normalizeAll<T extends PlanDay>(days: T[], field: (i: number) => string): Promise<T[]> {
    return Promise.all(days.map((d, i) => this.normalize(d, field(i))));
  }
}
