import type { Router } from 'express';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import { MongooseTransactionRunner } from '@/shared/db/mongooseTransactionRunner.js';
import { SyncSourceRegistry } from './application/syncSourceRegistry.js';
import { SyncHandlerRegistry } from './application/syncHandlerRegistry.js';
import { ListDraftsUseCase } from './application/usecases/listDrafts.usecase.js';
import { PullSnapshotsUseCase } from './application/usecases/pullSnapshots.usecase.js';
import { SnapshotCache } from './application/snapshotCache.js';
import { PushRecordsUseCase } from './application/usecases/pushRecords.usecase.js';
import { PutDraftsUseCase } from './application/usecases/putDrafts.usecase.js';
import type { UserDirectoryPort } from './domain/userDirectory.port.js';
import { MongoSyncDraftAdapter } from './infrastructure/mongoSyncDraft.adapter.js';
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
  const drafts = new MongoSyncDraftAdapter();
  const transactions = new MongooseTransactionRunner();
  const handlers = new SyncHandlerRegistry();
  const sources = new SyncSourceRegistry();

  // 2. Use cases
  // A phone's pull within a minute reuses what was built (2026-11-27); a push clears that user's copies.
  const snapshots = new SnapshotCache();
  const push = new PushRecordsUseCase(handlers, receipts, drafts, transactions, users, config, () => new Date(), (userId) => snapshots.forget(userId));
  const putDrafts = new PutDraftsUseCase(drafts, receipts, users, config);
  const listDrafts = new ListDraftsUseCase(drafts, receipts);
  const pull = new PullSnapshotsUseCase(sources, users, () => new Date(), snapshots);

  return {
    contract: {
      registerHandler: (definition) => handlers.register(definition),
      registerSource: (definition) => sources.register(definition),
    },
    buildRouter: () => buildSyncRouter(makeSyncControllers({ push, putDrafts, listDrafts, pull })),
    push,
  };
}
