import type { RequestHandler } from 'express';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { requiredParam } from '@/shared/http/params.util.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import type { GetRouteUseCase } from '../application/usecases/getRoute.usecase.js';
import type { OverrideRouteDistanceUseCase } from '../application/usecases/overrideRouteDistance.usecase.js';
import type { RecalculateRouteDistanceUseCase } from '../application/usecases/recalculateRouteDistance.usecase.js';
import type { SearchPlacesUseCase } from '../application/usecases/searchPlaces.usecase.js';
import type { UpdateRouteWaypointsUseCase } from '../application/usecases/updateRouteWaypoints.usecase.js';

export function makeGetRouteController(useCase: GetRouteUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    const route = await useCase.execute(requiredParam(req.params, 'id'));
    sendSuccess(req, res, route, 'Route fetched.', 200);
  });
}

export function makeUpdateRouteWaypointsController(useCase: UpdateRouteWaypointsUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    const route = await useCase.execute(requiredParam(req.params, 'id'), req.body);
    const message =
      route.distanceStatus === 'CALCULATED'
        ? 'Waypoints updated and distance recalculated.'
        : 'Waypoints updated, but the distance could not be calculated. Retry with recalculate.';
    sendSuccess(req, res, route, message, 200);
  });
}

export function makeRecalculateRouteDistanceController(useCase: RecalculateRouteDistanceUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    const route = await useCase.execute(requiredParam(req.params, 'id'));
    const message =
      route.distanceStatus === 'CALCULATED' ? 'Distance recalculated.' : 'The distance could not be calculated.';
    sendSuccess(req, res, route, message, 200);
  });
}

export function makeOverrideRouteDistanceController(useCase: OverrideRouteDistanceUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    const route = await useCase.execute(requiredParam(req.params, 'id'), req.body);
    sendSuccess(req, res, route, 'Distance overridden. The next waypoint edit will recalculate it.', 200);
  });
}

export function makeSearchPlacesController(useCase: SearchPlacesUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    const candidates = await useCase.execute((req.query as { q: string }).q);
    sendSuccess(req, res, candidates, 'Places found.', 200);
  });
}
