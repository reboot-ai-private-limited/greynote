import type { RequestHandler } from 'express';
import { AppError } from '@/shared/errors/AppError.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { requiredParam } from '@/shared/http/params.util.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import type { AssignRouteUseCase } from '../application/usecases/assignRoute.usecase.js';
import type { GetRouteUseCase } from '../application/usecases/getRoute.usecase.js';
import type { ListRouteAssignmentsUseCase } from '../application/usecases/listRouteAssignments.usecase.js';
import type { ListRoutesForUserUseCase } from '../application/usecases/listRoutesForUser.usecase.js';
import type { SearchPlacesUseCase } from '../application/usecases/searchPlaces.usecase.js';
import type { UnassignRouteUseCase } from '../application/usecases/unassignRoute.usecase.js';
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

export function makeUserRoutesController(useCase: ListRoutesForUserUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    const routes = await useCase.execute(requiredParam(req.params, 'userId'));
    sendSuccess(req, res, routes, 'Employee routes.', 200);
  });
}
