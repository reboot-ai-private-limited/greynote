import type { Router } from 'express';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import { MongooseTransactionRunner } from '@/shared/db/mongooseTransactionRunner.js';
import { SyncHandlerRegistry } from './application/syncHandlerRegistry.js';
import { PushRecordsUseCase } from './application/usecases/pushRecords.usecase.js';
import type { UserDirectoryPort } from './domain/userDirectory.port.js';
import { MongoSyncReceiptAdapter } from './infrastructure/mongoSyncReceipt.adapter.js';
import { makeSyncControllers } from './interface/sync.controller.js';
import { buildSyncRouter } from './interface/sync.route.js';
import type { SyncPublicContract } from './sync.public.js';

export interface SyncContainer {
  contract: SyncPublicContract;
  buildRouter: () => Router;
  /** For scripts and live checks; other modules only ever get `contract`. */
  push: PushRecordsUseCase;
}

/** Identity's and Config's public contracts, passed in by the composition root. */
export function buildSyncContainer(users: UserDirectoryPort, config: ConfigReader): SyncContainer {
  // 1. Adapters
  const receipts = new MongoSyncReceiptAdapter();
  const transactions = new MongooseTransactionRunner();
  const handlers = new SyncHandlerRegistry();

  // 2. Use cases
  const push = new PushRecordsUseCase(handlers, receipts, transactions, users, config);

  return {
    contract: { registerHandler: (definition) => handlers.register(definition) },
    buildRouter: () => buildSyncRouter(makeSyncControllers({ push })),
    push,
  };
}
