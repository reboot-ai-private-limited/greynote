import { AppError } from '@/shared/errors/AppError.js';
import type { SyncSourceDefinition } from '../domain/syncSource.js';

/** The sources owning modules registered at boot. The sync module knows none until its owner registers it. */
export class SyncSourceRegistry {
  private readonly sources = new Map<string, SyncSourceDefinition>();

  register(definition: SyncSourceDefinition): void {
    if (!/^[a-z][A-Za-z0-9]*$/.test(definition.name)) {
      throw AppError.internal('INTERNAL', { reason: 'SYNC_SOURCE_BAD_NAME', name: definition.name });
    }
    if (this.sources.has(definition.name)) {
      throw AppError.internal('INTERNAL', { reason: 'SYNC_SOURCE_REGISTERED_TWICE', name: definition.name });
    }
    this.sources.set(definition.name, definition);
  }

  names(): string[] {
    return [...this.sources.keys()].sort();
  }

  find(name: string): SyncSourceDefinition | undefined {
    return this.sources.get(name);
  }
}
