import type { RouteSummary } from './domain/routeView.js';
import { Router } from 'express';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import { RouteTypeRules } from './application/usecases/routeTypeRules.js';
import { toRouteSummaries } from './application/usecases/routeSummaries.js';
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
import { ImportRoutesUseCase } from './application/usecases/importRoutes.usecase.js';
import { GetRoutePathUseCase } from './application/usecases/getRoutePath.usecase.js';
import { GetRouteSummaryUseCase } from './application/usecases/getRouteSummary.usecase.js';
import { ListRouteAssignmentsUseCase } from './application/usecases/listRouteAssignments.usecase.js';
import { ListRouteIdsInScopeUseCase } from './application/usecases/listRouteIdsInScope.usecase.js';
import { ListRoutesForUserUseCase, ListRoutesForUsersUseCase } from './application/usecases/listRoutesForUser.usecase.js';
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
import { ExtendManagerTerritoryUseCase } from './application/usecases/extendManagerTerritory.usecase.js';
import { GetTerritoryGapsUseCase } from './application/usecases/getTerritoryGaps.usecase.js';
import { GetManagerCoverageUseCase, SetManagerCoverageUseCase } from './application/usecases/managerCoverage.usecase.js';
import { ListManagerCandidatesUseCase } from './application/usecases/listManagerCandidates.usecase.js';
import { MongoManagerCoverageAdapter } from './infrastructure/mongoManagerCoverage.adapter.js';
import { GetTeamTerritoryUseCase } from './application/usecases/getTeamTerritory.usecase.js';
import { buildManagerCandidatesRouter, buildManagerCoverageRouter, buildPersonTeamHqsRouter, buildTeamGapsRouter, buildTeamTerritoryRouter } from './interface/managerCoverage.route.js';
import type { ManagerDirectoryPort } from './domain/managerDirectory.port.js';
import { MongooseTransactionRunner } from '@/shared/db/mongooseTransactionRunner.js';
import { SearchPlacesUseCase } from './application/usecases/searchPlaces.usecase.js';
import { UpdateRouteUseCase } from './application/usecases/updateRoute.usecase.js';
import { CreatePlaceUseCase, ListPlacesUseCase, UpdatePlaceUseCase } from './application/usecases/places.usecase.js';
import { PlaceRoutes } from './application/usecases/placeRoutes.js';
import { MongoPlaceAdapter } from './infrastructure/mongoPlace.adapter.js';
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
  const placeRepository = new MongoPlaceAdapter();
  const placeRoutes = new PlaceRoutes(placeRepository, hqRepository, routeRepository);
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
    create: new CreateHqUseCase(hqRepository, zoneRepository, placeRoutes),
    update: new UpdateHqUseCase(hqRepository, zoneRepository, routeRepository, placeRepository, placeRoutes),
  };
  const createRoute = new CreateRouteUseCase(routeRepository, hqRepository, placeRepository, placeRoutes, typeRules);
  const placeCrud = makeHierarchyController(
    {
      list: new ListPlacesUseCase(placeRepository, routeRepository),
      // A place may come with its km from the HQ town: that route is made by the same use case as any route.
      create: new CreatePlaceUseCase(placeRepository, hqRepository, (input) => createRoute.execute(input)),
      update: new UpdatePlaceUseCase(placeRepository, hqRepository, routeRepository, placeRoutes),
    },
    'Place',
  );

  // 3. Controllers — Routes share the list/create/update shape with the levels above, plus
  // assignments.
  const routeCrud = makeHierarchyController(
    {
      list: new ListRoutesUseCase(routeRepository),
      create: createRoute,
      update: new UpdateRouteUseCase(routeRepository, hqRepository, assignmentRepository, placeRoutes, typeRules),
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
  const listRoutesForUsers = new ListRoutesForUsersUseCase(userHqRepository, routeRepository, placeRepository, hqRepository);
  const listRoutesForUser = new ListRoutesForUserUseCase(listRoutesForUsers);
  const getRouteSummary = new GetRouteSummaryUseCase(routeRepository, hqRepository);
  const getRoutePath = new GetRoutePathUseCase(routeRepository, hqRepository);
  const listRouteIdsInScope = new ListRouteIdsInScopeUseCase(routeRepository);
  const importHierarchy = new ImportHierarchyUseCase(zoneRepository, hqRepository, placeRoutes);
  const importRoutes = new ImportRoutesUseCase(hqRepository, placeRepository, routeRepository, placeRoutes);
  const searchPlaces = makeSearchPlacesController(new SearchPlacesUseCase(placeSearch));
  // Where each person is based, remembered for a minute; dropped at once when their HQ changes (2026-11-27).
  const userTerritory = new GetUserTerritoryUseCase(userHqRepository, hqRepository);
  const userHq = {
    set: new SetUserHqUseCase(userHqRepository, hqRepository, users, transactions, (userId) => userTerritory.forget(userId)),
    get: new GetUserHqUseCase(userHqRepository, hqRepository),
  };

  const getCoverage = new GetManagerCoverageUseCase(coverageRepository, userHqRepository, hqRepository);
  const setCoverage = new SetManagerCoverageUseCase(coverageRepository, hqRepository, zoneRepository, users, userHqRepository, userHq.set);
  const managerCoverage = {
    get: getCoverage,
    set: setCoverage,
    territory: userTerritory,
    extend: new ExtendManagerTerritoryUseCase(getCoverage),
    gaps: new GetTerritoryGapsUseCase(),
  };
  const teamTerritory = new GetTeamTerritoryUseCase(users, getCoverage, hqRepository, zoneRepository, routeRepository);
  const managerCandidates = new ListManagerCandidatesUseCase(users, userHqRepository, hqRepository);

  // A deleted item is still read by history (calls, plans, TA, reports) through its archive row, shown as inactive: reads work, new writes refuse it.
  const getRoute = async (routeId: string): Promise<RouteSummary | null> => {
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
              taFixedPaise: gone.taFixedPaise ?? null,
              fromPlaceId: null,
              toPlaceId: null,
              status: 'inactive',
            }
          : null;
  };
  /** Many routes in two queries (2026-11-27); any not found live (deleted) falls back to `getRoute`'s archive read. */
  const getRoutes = async (routeIds: string[]): Promise<RouteSummary[]> => {
    const ids = [...new Set(routeIds)].filter((id) => /^[a-f\d]{24}$/i.test(id));
    const live = ids.length > 0 ? await toRouteSummaries(hqRepository, await routeRepository.findByIds(ids)) : [];
    const found = new Set(live.map((r) => r.id));
    const gone = (await Promise.all(ids.filter((id) => !found.has(id)).map(getRoute))).filter((r): r is RouteSummary => r !== null);
    return [...live, ...gone];
  };

  return {
    contract: {
      getRoute,
      getRoutes,
      listRoutesForUser: (userId) => listRoutesForUser.execute(userId),
      listRoutesForUsers: (userIds) => listRoutesForUsers.execute(userIds),
      listHoldersOfRoutes: (routeIds) => listRoutesForUsers.holders(routeIds),
      getRoutePath: async (routeId) => {
        const live = await getRoutePath.execute(routeId);
        if (live) return live;
        const gone = await deletionStore.findArchived('ROUTE', routeId);
        return gone && gone.hqId && gone.zoneId && gone.routeType ? { routeId, routeType: gone.routeType, hqId: gone.hqId, zoneId: gone.zoneId } : null;
      },
      listRouteIdsInScope: (scope) => listRouteIdsInScope.execute(scope),
      listHqIdsInZone: async (zoneId) => (await hqRepository.list({ page: 1, pageSize: 1000, zoneId })).items.map((h) => h.id),
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
      getPlace: (placeId) => (/^[a-f\d]{24}$/i.test(placeId) ? placeRepository.findById(placeId) : Promise.resolve(null)),
      getPlaces: (placeIds) => placeRepository.findByIds(placeIds.filter((id) => /^[a-f\d]{24}$/i.test(id))),
      listPlacesForUser: async (userId) => {
        const hq = await userHqRepository.findActive(userId);
        if (!hq) return [];
        return (await placeRepository.list({ hqId: hq.hqId, status: 'active', page: 1, pageSize: 100_000 })).items;
      },
      listPlacesByUser: async (userIds) => {
        const assignments = await userHqRepository.findActiveForUsers(userIds);
        const hqOf = new Map(assignments.map((a) => [a.userId, a.hqId]));
        const hqIds = [...new Set(assignments.map((a) => a.hqId))];
        const lists = await Promise.all(hqIds.map(async (hqId) => [hqId, (await placeRepository.list({ hqId, status: 'active', page: 1, pageSize: 100_000 })).items] as const));
        const placesOf = new Map(lists);
        return userIds.map((userId) => ({ userId, places: placesOf.get(hqOf.get(userId) ?? '') ?? [] }));
      },
      listPlacesForUsers: async (userIds) => {
        const hqIds = [...new Set((await userHqRepository.findActiveForUsers(userIds)).map((a) => a.hqId))];
        const [lists, hqs] = await Promise.all([
          Promise.all(hqIds.map((hqId) => placeRepository.list({ hqId, status: 'active', page: 1, pageSize: 100_000 }))),
          hqRepository.findByIds(hqIds),
        ]);
        const hqName = new Map(hqs.map((h) => [h.id, h.name]));
        return lists.flatMap((l) => l.items.map((p) => ({ ...p, hqName: hqName.get(p.hqId) ?? '' })));
      },
      findRouteBetween: async (placeA, placeB) => {
        const valid = (id: string) => /^[a-f\d]{24}$/i.test(id);
        if (!valid(placeA) || !valid(placeB)) return null;
        const route = await routeRepository.findByPair(placeA, placeB);
        return route ? ((await toRouteSummaries(hqRepository, [route]))[0] ?? null) : null;
      },
      listPlaceIdsInScope: async (scope) => {
        if (!scope.hqId && !scope.zoneId) return [];
        const query = scope.hqId ? { hqId: scope.hqId } : { zoneId: scope.zoneId };
        return (await placeRepository.list({ ...query, page: 1, pageSize: 100_000 })).items.map((p) => p.id);
      },
      anchorRouteForPlace: async (placeId) => {
        const place = /^[a-f\d]{24}$/i.test(placeId) ? await placeRepository.findById(placeId) : null;
        if (!place) return null;
        const town = await placeRepository.findHqTown(place.hqId);
        const toTown = town ? await routeRepository.findByPair(place.id, town.id) : null;
        if (toTown?.status === 'active') return toTown.id;
        const touching = (await routeRepository.listTouchingPlace(place.id)).filter((r) => r.status === 'active').sort((a, b) => a.name.localeCompare(b.name));
        return touching[0]?.id ?? null;
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
      router.use('/places', buildPlacesRouter({ search: searchPlaces, ...placeCrud }));
      router.use('/import', buildImportRouter(importHierarchy, importRoutes));
      router.use('/my-routes', buildMyRoutesRouter(makeMyRoutesController(listRoutesForUser)));
      router.use('/users', buildUserHqRouter({ ...userHq, routes: makeUserRoutesController(listRoutesForUser) }));
      router.use('/users', buildManagerCoverageRouter(managerCoverage));
      router.use('/users', buildPersonTeamHqsRouter(teamTerritory));
      router.use('/manager-candidates', buildManagerCandidatesRouter(managerCandidates));
      router.use('/team-gaps', buildTeamGapsRouter(managerCoverage.gaps));
      router.use('/team', buildTeamTerritoryRouter(teamTerritory));
      return router;
    },
  };
}
