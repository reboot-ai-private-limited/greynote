import { AppError } from '@/shared/errors/AppError.js';
import type { SyncHandlerDefinition } from '../domain/syncHandler.js';

/**
 * The kinds owning modules have registered at boot. The sync module knows nothing about any kind
 * until its owner registers it — which is what keeps it free of Field Master Data / Field Activity imports.
 */
export class SyncHandlerRegistry {
  private readonly handlers = new Map<string, SyncHandlerDefinition>();

  register(definition: SyncHandlerDefinition): void {
    if (this.handlers.has(definition.kind)) {
      throw AppError.internal('INTERNAL', { reason: 'SYNC_KIND_REGISTERED_TWICE', kind: definition.kind });
    }
    this.handlers.set(definition.kind, definition);
  }

  /** `undefined` for a kind nobody registered — a record of that kind is the phone's mistake, not a fault. */
  find(kind: string): SyncHandlerDefinition | undefined {
    return this.handlers.get(kind);
  }
}
