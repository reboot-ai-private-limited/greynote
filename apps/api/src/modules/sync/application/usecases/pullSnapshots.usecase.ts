import type { RoleName } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import { logger } from '@/shared/logging/logger.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import { canonicalize, versionOf } from '../snapshotVersion.js';
import type { SyncSourceRegistry } from '../syncSourceRegistry.js';

export type SourceResult =
  | { version: string; unchanged: true }
  | { version: string; data: unknown }
  | { error: { code: string; message: string } };

export interface PullResponse {
  /** The server's clock, so the phone can tell how far its own is off. */
  serverTime: string;
  sources: Record<string, SourceResult>;
}

/**
 * The phone's reference data (LLD sync.md, Pull): for each source, a versioned snapshot of what this
 * user may see. The phone sends the version it holds; an equal one gets `{ unchanged: true }` and no
 * data, otherwise the whole new snapshot with its version. Sources are read in parallel and each is
 * isolated: one that fails is reported as an error for that source alone, so a broken feed can't stop
 * the phone refreshing the rest. Scoped to the caller — the user comes from the token.
 */
export class PullSnapshotsUseCase {
  constructor(
    private readonly sources: SyncSourceRegistry,
    private readonly users: UserDirectoryPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(actor: { id: string; role: RoleName }, have: Record<string, string>, only: string[] | null): Promise<PullResponse> {
    const user = await this.users.findUserSummary(actor.id);
    if (!user || user.role !== 'FIELD' || user.status !== 'active') {
      throw AppError.forbidden('Only active field employees have reference data to sync.');
    }
    const names = only ?? this.sources.names();
    const unknown = names.filter((n) => !this.sources.find(n));
    if (unknown.length > 0) throw AppError.badRequest(`Unknown data source: ${unknown.join(', ')}.`, { field: 'only', sources: this.sources.names() });

    const entries = await Promise.all(
      names.map(async (name): Promise<[string, SourceResult]> => {
        try {
          const canonical = canonicalize(await this.sources.find(name)!.snapshot(actor.id));
          const version = versionOf(canonical);
          return [name, have[name] === version ? { version, unchanged: true } : { version, data: canonical }];
        } catch (err) {
          logger.error({ err: String(err), source: name }, 'sync source failed');
          return [name, { error: { code: 'SOURCE_UNAVAILABLE', message: 'This data could not be read just now. Try again shortly.' } }];
        }
      }),
    );
    return { serverTime: this.now().toISOString(), sources: Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b))) };
  }
}
