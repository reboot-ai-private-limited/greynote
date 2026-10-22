import { Router } from 'express';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import { RouteTypeRules } from './application/usecases/routeTypeRules.js';
import { AssignRouteUseCase } from './application/usecases/assignRoute.usecase.js';
import { CreateHqUseCase } from './application/usecases/createHq.usecase.js';
import { CreateZoneUseCase } from './application/usecases/createZone.usecase.js';
import { ListHqsUseCase } from './application/usecases/listHqs.usecase.js';
import { ListZonesUseCase } from './application/usecases/listZones.usecase.js';
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
import { TerritoryDeletionUseCase, type ReferenceCounter } from './application/usecases/territoryDeletion.usecase.js';
import { MongoTerritoryDeletionAdapter } from './infrastructure/mongoTerritoryDeletion.adapter.js';
import { buildTerritoryDeletionRouter } from './interface/territoryDeletion.route.js';
import { GetUserTerritoryUseCase } from './application/usecases/getUserTerritory.usecase.js';
import { GetManagerCoverageUseCase, SetManagerCoverageUseCase } from './application/usecases/managerCoverage.usecase.js';
import { ListManagerCandidatesUseCase } from './application/usecases/listManagerCandidates.usecase.js';
import { MongoManagerCoverageAdapter } from './infrastructure/mongoManagerCoverage.adapter.js';
import { buildManagerCandidatesRouter, buildManagerCoverageRouter } from './interface/managerCoverage.route.js';
import type { ManagerDirectoryPort } from './domain/managerDirectory.port.js';
import { MongooseTransactionRunner } from '@/shared/db/mongooseTransactionRunner.js';
import { SearchPlacesUseCase } from './application/usecases/searchPlaces.usecase.js';
import { UpdateRouteUseCase } from './application/usecases/updateRoute.usecase.js';
import { MongoHqAdapter } from './infrastructure/mongoHq.adapter.js';
import { MongoZoneAdapter } from './infrastructure/mongoZone.adapter.js';
import { GooglePlaceSearchAdapter } from './infrastructure/googlePlaceSearch.adapter.js';
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
  makeUserRoutesController,
  makeUnassignRouteController,
  makeSearchPlacesController,
} from './interface/routes.controller.js';
import { buildMyRoutesRouter, buildPlacesRouter, buildRoutesRouter } from './interface/routes.route.js';
import type { TerritoryPublicContract } from './territory.public.js';

export interface TerritoryContainer {
  contract: TerritoryPublicContract;
  buildRouter: () => Router;
  /** Counts, from the modules above Territory, of what points at an item about to be deleted. Bound by the composition root. */
  bindReferenceCounter: (counter: ReferenceCounter) => void;
}

/** `users` is Identity's public contract, passed in by the top-level composition root. */
export function buildTerritoryContainer(users: UserDirectoryPort & ManagerDirectoryPort, config: ConfigReader): TerritoryContainer {
  // 1. Adapters
  const zoneRepository = new MongoZoneAdapter();
  const hqRepository = new MongoHqAdapter();
  const routeRepository = new MongoRouteAdapter();
  const assignmentRepository = new MongoRouteAssignmentAdapter();
  const placeSearch = new GooglePlaceSearchAdapter();
  const userHqRepository = new MongoUserHqAssignmentAdapter();
  const coverageRepository = new MongoManagerCoverageAdapter();
  const transactions = new MongooseTransactionRunner();
  const typeRules = new RouteTypeRules(config);
  const deletionStore = new MongoTerritoryDeletionAdapter();
  const deletion = new TerritoryDeletionUseCase(deletionStore);

  // 2. Use cases
  const zones = {
    list: new ListZonesUseCase(zoneRepository),
    create: new CreateZoneUseCase(zoneRepository),
    update: new UpdateZoneUseCase(zoneRepository, hqRepository),
  };
  const hqs = {
    list: new ListHqsUseCase(hqRepository),
    create: new CreateHqUseCase(hqRepository, zoneRepository),
    update: new UpdateHqUseCase(hqRepository, zoneRepository, routeRepository),
  };

  // 3. Controllers — Routes share the list/create/update shape with the levels above, plus
  // assignments.
  const routeCrud = makeHierarchyController(
    {
      list: new ListRoutesUseCase(routeRepository),
      create: new CreateRouteUseCase(routeRepository, hqRepository, typeRules),
      update: new UpdateRouteUseCase(routeRepository, hqRepository, assignmentRepository, typeRules),
    },
    'Route',
  );
  const assignRoute = new AssignRouteUseCase(routeRepository, assignmentRepository, users);
  const routeControllers = {
    ...routeCrud,
    get: makeGetRouteController(new GetRouteUseCase(routeRepository, typeRules)),
    assign: makeAssignRouteController(assignRoute),
    listAssignments: makeListRouteAssignmentsController(
      new ListRouteAssignmentsUseCase(routeRepository, assignmentRepository, users),
    ),
    unassign: makeUnassignRouteController(new UnassignRouteUseCase(assignmentRepository)),
  };
  const listRoutesForUser = new ListRoutesForUserUseCase(assignmentRepository, routeRepository, hqRepository);
  const getRouteSummary = new GetRouteSummaryUseCase(routeRepository, hqRepository);
  const getRoutePath = new GetRoutePathUseCase(routeRepository, hqRepository);
  const listRouteIdsInScope = new ListRouteIdsInScopeUseCase(routeRepository);
  const importHierarchy = new ImportHierarchyUseCase(zoneRepository, hqRepository);
  const searchPlaces = makeSearchPlacesController(new SearchPlacesUseCase(placeSearch));
  const userHq = {
    set: new SetUserHqUseCase(userHqRepository, hqRepository, users, transactions),
    get: new GetUserHqUseCase(userHqRepository, hqRepository),
  };

  const managerCoverage = {
    get: new GetManagerCoverageUseCase(coverageRepository, userHqRepository, hqRepository),
    set: new SetManagerCoverageUseCase(coverageRepository, hqRepository, zoneRepository, users, userHqRepository, userHq.set),
    territory: new GetUserTerritoryUseCase(coverageRepository, userHqRepository, hqRepository),
  };
  const managerCandidates = new ListManagerCandidatesUseCase(users, coverageRepository, hqRepository);

  return {
    contract: {
      // A deleted item is still read by history (calls, plans, TA, reports) through its archive row, shown as inactive: reads work, new writes refuse it.
      getRoute: async (routeId) => {
        const live = await getRouteSummary.execute(routeId);
        if (live) return live;
        const gone = await deletionStore.findArchived('ROUTE', routeId);
        return gone
          ? {
              id: gone.id,
              name: gone.name,
              hqId: gone.hqId ?? '',
              hqName: gone.hqName ?? '',
              routeType: gone.routeType ?? 'HQ',
              distanceKm: gone.distanceKm,
              distanceStatus: gone.distanceKm === null ? 'FAILED' : 'CALCULATED',
              taPerKmRateOverridePaise: gone.taPerKmRateOverridePaise,
              status: 'inactive',
            }
          : null;
      },
      listRoutesForUser: (userId) => listRoutesForUser.execute(userId),
      getRoutePath: async (routeId) => {
        const live = await getRoutePath.execute(routeId);
        if (live) return live;
        const gone = await deletionStore.findArchived('ROUTE', routeId);
        return gone && gone.hqId && gone.zoneId && gone.routeType ? { routeId, routeType: gone.routeType, hqId: gone.hqId, zoneId: gone.zoneId } : null;
      },
      listRouteIdsInScope: (scope) => listRouteIdsInScope.execute(scope),
      getUserHq: (userId) => userHq.get.current(userId),
      getUserTerritory: (userId) => managerCoverage.territory.execute(userId),
      assignUserCoverage: async (userId, input, actorId) => {
        await managerCoverage.set.execute(userId, input, actorId);
      },
      assignUserHq: (userId, hqId, actorId) => userHq.set.execute(userId, hqId, actorId),
      countUserHoldings: async (userId) => {
        const [routes, coverage] = await Promise.all([assignmentRepository.listActiveForUser(userId), coverageRepository.find(userId)]);
        return { routes: routes.length, coverage: (coverage?.hqIds.length ?? 0) + (coverage?.zoneIds.length ?? 0) };
      },
      releaseUserHoldings: async (userId, actorId) => {
        const routes = await assignmentRepository.listActiveForUser(userId);
        for (const a of routes) await assignmentRepository.deactivate(a.id, actorId);
        const coverage = await coverageRepository.find(userId);
        const covered = (coverage?.hqIds.length ?? 0) + (coverage?.zoneIds.length ?? 0);
        if (covered > 0) await coverageRepository.save({ userId, hqIds: [], zoneIds: [], updatedBy: actorId });
        return { routes: routes.length, coverage: covered };
      },
      assignUserRoutes: async (userId, routeIds, actorId) => {
        for (const routeId of routeIds) {
          if (await assignmentRepository.findActive(routeId, userId)) continue;
          await assignRoute.execute(routeId, userId, actorId);
        }
      },
      getHq: async (hqId) => {
        const live = await hqRepository.findById(hqId);
        if (live) return live;
        const gone = await deletionStore.findArchived('HQ', hqId);
        return gone && gone.zoneId ? { id: gone.id, zoneId: gone.zoneId, name: gone.name, status: 'inactive' } : null;
      },
      getZone: async (zoneId) => {
        const live = await zoneRepository.findById(zoneId);
        if (live) return live;
        const gone = await deletionStore.findArchived('ZONE', zoneId);
        return gone ? { id: gone.id, name: gone.name, status: 'inactive' } : null;
      },
      findZoneByName: (name) => zoneRepository.findByName(name),
      findHqByName: (zoneId, name) => hqRepository.findByName(zoneId, name),
    },

    bindReferenceCounter: (counter) => deletion.bindReferenceCounter(counter),

    buildRouter: () => {
      const router = Router();
      // Delete routes first: they share the level routers' paths and are Admin-only.
      router.use(buildTerritoryDeletionRouter(deletion));
      router.use(buildHierarchyRouter({ zones, hqs }));
      router.use('/routes', buildRoutesRouter(routeControllers));
      router.use('/places', buildPlacesRouter(searchPlaces));
      router.use('/import', buildImportRouter(importHierarchy));
      router.use('/my-routes', buildMyRoutesRouter(makeMyRoutesController(listRoutesForUser)));
      router.use('/users', buildUserHqRouter({ ...userHq, routes: makeUserRoutesController(listRoutesForUser) }));
      router.use('/users', buildManagerCoverageRouter(managerCoverage));
      router.use('/manager-candidates', buildManagerCandidatesRouter(managerCandidates));
      return router;
    },
  };
}
