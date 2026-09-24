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
import { MongoAreaAdapter } from './infrastructure/mongoArea.adapter.js';
import { MongoHqAdapter } from './infrastructure/mongoHq.adapter.js';
import { MongoZoneAdapter } from './infrastructure/mongoZone.adapter.js';
import { buildHierarchyRouter } from './interface/hierarchy.route.js';

/**
 * Zone → HQ → Area so far. No public contract yet: nothing outside Territory reads these levels
 * directly — consumers reach them through Routes (`getRoutePath`), which arrive with the contract
 * later in Phase 2 (docs/LLD/territory.md).
 */
export interface TerritoryContainer {
  buildRouter: () => Router;
}

export function buildTerritoryContainer(): TerritoryContainer {
  // 1. Adapters
  const zoneRepository = new MongoZoneAdapter();
  const hqRepository = new MongoHqAdapter();
  const areaRepository = new MongoAreaAdapter();

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
    update: new UpdateAreaUseCase(areaRepository, hqRepository),
  };

  return {
    buildRouter: () => buildHierarchyRouter({ zones, hqs, areas }),
  };
}
