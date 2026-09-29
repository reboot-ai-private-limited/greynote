import type { SyncHandlerDefinition } from './domain/syncHandler.js';

export { SyncRejection } from './domain/syncHandler.js';
export type { SyncApplyContext, SyncHandlerDefinition } from './domain/syncHandler.js';
export type { SyncReason, SyncRecordInput, SyncResult, SyncStatus } from './domain/syncRecord.js';

/**
 * The only thing another module may import from `sync/`. An owning module registers a handler per
 * kind of record the phone sends at Submit; pushing and the receipts are the sync module's own.
 */
export interface SyncPublicContract {
  registerHandler(definition: SyncHandlerDefinition): void;
}
