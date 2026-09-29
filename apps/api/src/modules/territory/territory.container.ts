import type { Router } from 'express';
import { AssignRouteUseCase } from './application/usecases/assignRoute.usecase.js';
import { CreateAreaUseCase } from './application/usecases/createArea.usecase.js';
import { CreateHqUseCase } from './application/usecases/createHq.usecase.js';
import { CreateZoneUseCase } from './application/usecases/createZone.usecase.js';
import { ListAreasUseCase } from './application/usecases/listAreas.usecase.js';
import { ListHqsUseCase } from './application/usecases/listHqs.usecase.js';
import { ListZonesUseCase } from './application/usecases/listZones.usecase.js';
import { UpdateAreaUseCase } from './application/usecases/updateArea.usecase.js';
import { UpdateHqUseCase } from './application/usecases/updateHq.usecase.js';
import { UpdateZoneUseCase } from './application/usecases/updateZone.usecase.js';
import { CreateRouteUseCase } from './application/usecases/createRoute.usecase.js';
import { GetRouteUseCase } from './application/usecases/getRoute.usecase.js';
import { ImportHierarchyUseCase } from './application/usecases/importHierarchy.usecase.js';
import { GetRoutePathUseCase } from './application/usecases/getRoutePath.usecase.js';
import { GetRouteSummaryUseCase } from './application/usecases/getRouteSummary.usecase.js';
import { ListRouteAssignmentsUseCase } from './application/usecases/listRouteAssignments.usecase.js';
import { ListRouteIdsInScopeUseCase } from './application/usecases/listRouteIdsInScope.usecase.js';
import { ListRoutesForUserUseCase } from './application/usecases/listRoutesForUser.usecase.js';
import { UnassignRouteUseCase } from './application/usecases/unassignRoute.usecase.js';
import { ListRoutesUseCase } from './application/usecases/listRoutes.usecase.js';
import { GetUserHqUseCase } from './application/usecases/getUserHq.usecase.js';
import { SetUserHqUseCase } from './application/usecases/setUserHq.usecase.js';
import { MongoUserHqAssignmentAdapter } from './infrastructure/mongoUserHqAssignment.adapter.js';
import { buildUserHqRouter } from './interface/userHq.route.js';
import { MongooseTransactionRunner } from '@/shared/db/mongooseTransactionRunner.js';
import { OverrideRouteDistanceUseCase } from './application/usecases/overrideRouteDistance.usecase.js';
import { RecalculateRouteDistanceUseCase } from './application/usecases/recalculateRouteDistance.usecase.js';
import { SearchPlacesUseCase } from './application/usecases/searchPlaces.usecase.js';
import { UpdateRouteUseCase } from './application/usecases/updateRoute.usecase.js';
import { UpdateRouteWaypointsUseCase } from './application/usecases/updateRouteWaypoints.usecase.js';
import { MongoAreaAdapter } from './infrastructure/mongoArea.adapter.js';
import { MongoHqAdapter } from './infrastructure/mongoHq.adapter.js';
import { MongoZoneAdapter } from './infrastructure/mongoZone.adapter.js';
import { GooglePlaceSearchAdapter } from './infrastructure/googlePlaceSearch.adapter.js';
import { GoogleRoutesDistanceAdapter } from './infrastructure/googleRoutesDistance.adapter.js';
import { MongoRouteAdapter } from './infrastructure/mongoRoute.adapter.js';
import { MongoRouteAssignmentAdapter } from './infrastructure/mongoRouteAssignment.adapter.js';
import type { UserDirectoryPort } from './domain/userDirectory.port.js';
import { makeHierarchyController } from './interface/hierarchy.controller.js';
import { buildHierarchyRouter } from './interface/hierarchy.route.js';
import { buildImportRouter } from './interface/import.route.js';
import {
  makeAssignRouteController,
  makeGetRouteController,
  makeListRouteAssignmentsController,
  makeMyRoutesController,
  makeUnassignRouteController,
  makeOverrideRouteDistanceController,
  makeRecalculateRouteDistanceController,
  makeSearchPlacesController,
  makeUpdateRouteWaypointsController,
} from './interface/routes.controller.js';
import { buildMyRoutesRouter, buildPlacesRouter, buildRoutesRouter } from './interface/routes.route.js';
import type { TerritoryPublicContract } from './territory.public.js';

export interface TerritoryContainer {
  contract: TerritoryPublicContract;
  buildRouter: () => Router;
}

/** `users` is Identity's public contract, passed in by the top-level composition root. */
export function buildTerritoryContainer(users: UserDirectoryPort): TerritoryContainer {
  // 1. Adapters
  const zoneRepository = new MongoZoneAdapter();
  const hqRepository = new MongoHqAdapter();
  const areaRepository = new MongoAreaAdapter();
  const routeRepository = new MongoRouteAdapter();
  const assignmentRepository = new MongoRouteAssignmentAdapter();
  const distanceProvider = new GoogleRoutesDistanceAdapter();
  const placeSearch = new GooglePlaceSearchAdapter();
  const userHqRepository = new MongoUserHqAssignmentAdapter();
  const transactions = new MongooseTransactionRunner();

  // 2. Use cases
  const zones = {
    list: new ListZonesUseCase(zoneRepository),
    create: new CreateZoneUseCase(zoneRepository),
    update: new UpdateZoneUseCase(zoneRepository, hqRepository),
  };
  const hqs = {
    list: new ListHqsUseCase(hqRepository),
    create: new CreateHqUseCase(hqRepository, zoneRepository),
    update: new UpdateHqUseCase(hqRepository, zoneRepository, areaRepository),
  };
  const areas = {
    list: new ListAreasUseCase(areaRepository),
    create: new CreateAreaUseCase(areaRepository, hqRepository),
    update: new UpdateAreaUseCase(areaRepository, hqRepository, routeRepository),
  };


  // 3. Controllers — Routes share the list/create/update shape with the levels above, plus four
  // distance-specific actions.
  const routeCrud = makeHierarchyController(
    {
      list: new ListRoutesUseCase(routeRepository),
      create: new CreateRouteUseCase(routeRepository, areaRepository, distanceProvider),
      update: new UpdateRouteUseCase(routeRepository, areaRepository, assignmentRepository),
    },
    'Route',
  );
  const routeControllers = {
    ...routeCrud,
    get: makeGetRouteController(new GetRouteUseCase(routeRepository)),
    updateWaypoints: makeUpdateRouteWaypointsController(new UpdateRouteWaypointsUseCase(routeRepository, distanceProvider)),
    overrideDistance: makeOverrideRouteDistanceController(new OverrideRouteDistanceUseCase(routeRepository)),
    recalculate: makeRecalculateRouteDistanceController(
      new RecalculateRouteDistanceUseCase(routeRepository, distanceProvider),
    ),
    assign: makeAssignRouteController(new AssignRouteUseCase(routeRepository, assignmentRepository, users)),
    listAssignments: makeListRouteAssignmentsController(
      new ListRouteAssignmentsUseCase(routeRepository, assignmentRepository, users),
    ),
    unassign: makeUnassignRouteController(new UnassignRouteUseCase(assignmentRepository)),
  };
  const listRoutesForUser = new ListRoutesForUserUseCase(assignmentRepository, routeRepository, areaRepository);
  const getRouteSummary = new GetRouteSummaryUseCase(routeRepository, areaRepository);
  const getRoutePath = new GetRoutePathUseCase(routeRepository, areaRepository, hqRepository);
  const listRouteIdsInScope = new ListRouteIdsInScopeUseCase(routeRepository);
  const importHierarchy = new ImportHierarchyUseCase(zoneRepository, hqRepository, areaRepository);
  const searchPlaces = makeSearchPlacesController(new SearchPlacesUseCase(placeSearch));
  const userHq = {
    set: new SetUserHqUseCase(userHqRepository, hqRepository, users, transactions),
    get: new GetUserHqUseCase(userHqRepository, hqRepository),
  };

  return {
    contract: {
      getRoute: (routeId) => getRouteSummary.execute(routeId),
      listRoutesForUser: (userId) => listRoutesForUser.execute(userId),
      getRoutePath: (routeId) => getRoutePath.execute(routeId),
      listRouteIdsInScope: (scope) => listRouteIdsInScope.execute(scope),
      getUserHq: (userId) => userHq.get.current(userId),
      getHq: (hqId) => hqRepository.findById(hqId),
      getZone: (zoneId) => zoneRepository.findById(zoneId),
    },

    buildRouter: () => {
      const router = buildHierarchyRouter({ zones, hqs, areas });
      router.use('/routes', buildRoutesRouter(routeControllers));
      router.use('/places', buildPlacesRouter(searchPlaces));
      router.use('/import', buildImportRouter(importHierarchy));
      router.use('/my-routes', buildMyRoutesRouter(makeMyRoutesController(listRoutesForUser)));
      router.use('/users', buildUserHqRouter(userHq));
      return router;
    },
  };
}
