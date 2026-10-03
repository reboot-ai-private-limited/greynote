import type { RequestHandler } from 'express';
import { AppError } from '@/shared/errors/AppError.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { requiredParam } from '@/shared/http/params.util.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import type { AssignRouteUseCase } from '../application/usecases/assignRoute.usecase.js';
import type { GetRouteUseCase } from '../application/usecases/getRoute.usecase.js';
import type { ListRouteAssignmentsUseCase } from '../application/usecases/listRouteAssignments.usecase.js';
import type { ListRoutesForUserUseCase } from '../application/usecases/listRoutesForUser.usecase.js';
import type { OverrideRouteDistanceUseCase } from '../application/usecases/overrideRouteDistance.usecase.js';
import type { RecalculateRouteDistanceUseCase } from '../application/usecases/recalculateRouteDistance.usecase.js';
import type { SearchPlacesUseCase } from '../application/usecases/searchPlaces.usecase.js';
import type { UnassignRouteUseCase } from '../application/usecases/unassignRoute.usecase.js';
import type { UpdateRouteDestinationUseCase } from '../application/usecases/updateRouteDestination.usecase.js';
import type { TerritoryStatus } from '../domain/territoryStatus.js';

function callerId(req: Parameters<RequestHandler>[0]): string {
  if (!req.user) throw AppError.unauthenticated();
  return req.user.sub;
}

export function makeGetRouteController(useCase: GetRouteUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    const route = await useCase.execute(requiredParam(req.params, 'id'));
    sendSuccess(req, res, route, 'Route fetched.', 200);
  });
}

export function makeUpdateRouteDestinationController(useCase: UpdateRouteDestinationUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    const route = await useCase.execute(requiredParam(req.params, 'id'), req.body);
    const message =
      route.distanceStatus === 'CALCULATED'
        ? 'Destination updated and distance recalculated.'
        : 'Destination updated, but the distance could not be calculated. Retry with recalculate.';
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
    sendSuccess(req, res, route, 'Distance overridden. The next destination edit will recalculate it.', 200);
  });
}

export function makeSearchPlacesController(useCase: SearchPlacesUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    const candidates = await useCase.execute((req.query as { q: string }).q);
    sendSuccess(req, res, candidates, 'Places found.', 200);
  });
}

export function makeAssignRouteController(useCase: AssignRouteUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    const assignment = await useCase.execute(requiredParam(req.params, 'id'), req.body.userId, callerId(req));
    sendSuccess(req, res, assignment, 'Employee assigned to route.', 201);
  });
}

export function makeUnassignRouteController(useCase: UnassignRouteUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    const assignment = await useCase.execute(
      requiredParam(req.params, 'id'),
      requiredParam(req.params, 'userId'),
      callerId(req),
    );
    sendSuccess(req, res, assignment, 'Employee unassigned from route.', 200);
  });
}

export function makeListRouteAssignmentsController(useCase: ListRouteAssignmentsUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    const { status } = req.query as { status?: TerritoryStatus };
    const assignments = await useCase.execute(requiredParam(req.params, 'id'), status);
    sendSuccess(req, res, assignments, 'Route assignments listed.', 200);
  });
}

export function makeMyRoutesController(useCase: ListRoutesForUserUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    const routes = await useCase.execute(callerId(req));
    sendSuccess(req, res, routes, 'Your routes.', 200);
  });
}
