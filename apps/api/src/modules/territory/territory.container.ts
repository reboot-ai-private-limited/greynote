import type { Router } from 'express';
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
import { ListRoutesUseCase } from './application/usecases/listRoutes.usecase.js';
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
import { makeHierarchyController } from './interface/hierarchy.controller.js';
import { buildHierarchyRouter } from './interface/hierarchy.route.js';
import {
  makeGetRouteController,
  makeOverrideRouteDistanceController,
  makeRecalculateRouteDistanceController,
  makeSearchPlacesController,
  makeUpdateRouteWaypointsController,
} from './interface/routes.controller.js';
import { buildPlacesRouter, buildRoutesRouter } from './interface/routes.route.js';

/**
 * Zone → HQ → Area → Route so far. No public contract yet: it arrives with RouteAssignment,
 * later in Phase 2 (docs/LLD/territory.md), when the first consumer-facing reads exist.
 */
export interface TerritoryContainer {
  buildRouter: () => Router;
}

export function buildTerritoryContainer(): TerritoryContainer {
  // 1. Adapters
  const zoneRepository = new MongoZoneAdapter();
  const hqRepository = new MongoHqAdapter();
  const areaRepository = new MongoAreaAdapter();
  const routeRepository = new MongoRouteAdapter();
  const distanceProvider = new GoogleRoutesDistanceAdapter();
  const placeSearch = new GooglePlaceSearchAdapter();

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
      update: new UpdateRouteUseCase(routeRepository, areaRepository),
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
  };
  const searchPlaces = makeSearchPlacesController(new SearchPlacesUseCase(placeSearch));

  return {
    buildRouter: () => {
      const router = buildHierarchyRouter({ zones, hqs, areas });
      router.use('/routes', buildRoutesRouter(routeControllers));
      router.use('/places', buildPlacesRouter(searchPlaces));
      return router;
    },
  };
}
