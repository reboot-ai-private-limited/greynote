import type { Router } from 'express';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import type { SyncPublicContract } from '@/modules/sync/sync.public.js';
import { makeMonthlyStockSyncHandler } from './application/monthlyStockSync.js';
import { SalesClock } from './application/salesClock.js';
import { ListMissingStockUseCase, ListMonthlyStockUseCase } from './application/usecases/readMonthlyStock.usecase.js';
import { RecordMonthlyStockUseCase } from './application/usecases/recordMonthlyStock.usecase.js';
import { UnlockMonthUseCase } from './application/usecases/unlockMonth.usecase.js';
import type { FieldMasterDataPort } from './domain/fieldMasterData.port.js';
import type { UserDirectoryPort } from './domain/userDirectory.port.js';
import { MongoMonthlyStockAdapter } from './infrastructure/mongoMonthlyStock.adapter.js';
import { makeSalesControllers } from './interface/sales.controller.js';
import { buildSalesRouter } from './interface/sales.route.js';
import { monthlyStockBodySchema } from './interface/sales.schemas.js';
import type { SalesPublicContract } from './sales.public.js';

export interface SalesContainer {
  contract: SalesPublicContract;
  /** The month-end stock check — run by `scripts/run-stock-check.ts`, never by the server. `month` defaults to the month that just ended. */
  runStockCheck: (month?: string) => Promise<{ month: string; missing: Awaited<ReturnType<ListMissingStockUseCase['execute']>> }>;
  buildRouter: () => Router;
}

/**
 * Tier 4. Monthly stock first (LLD sales-and-orders.md); Orders follow. Nothing here goes through the approval
 * module. Identity's, Field Master Data's, Sync's and Config's public contracts, passed in by the composition root.
 */
export function buildSalesContainer(users: UserDirectoryPort, master: FieldMasterDataPort, sync: SyncPublicContract, config: ConfigReader): SalesContainer {
  const stock = new MongoMonthlyStockAdapter();
  const clock = new SalesClock(config);

  const record = new RecordMonthlyStockUseCase(master, stock, clock);
  const list = new ListMonthlyStockUseCase(stock, master, users);
  const missing = new ListMissingStockUseCase(stock, master, users);
  const unlock = new UnlockMonthUseCase(stock, clock);

  sync.registerHandler(
    makeMonthlyStockSyncHandler(record, (payload) => {
      const b = monthlyStockBodySchema.parse(payload);
      return { outlet: { type: b.outletType, id: b.outletId }, month: b.month, lines: b.lines };
    }),
  );

  return {
    contract: { listMissingStock: (month) => missing.execute({ id: 'system', role: 'ADMIN' }, month) },
    runStockCheck: async (month) => {
      const m = month ?? (await clock.previousMonth());
      return { month: m, missing: await missing.execute({ id: 'system', role: 'ADMIN' }, m) };
    },
    buildRouter: () => buildSalesRouter(makeSalesControllers({ record, list, unlock, missing })),
  };
}
