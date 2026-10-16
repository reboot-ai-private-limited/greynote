import { randomUUID } from 'node:crypto';
import type { TerritoryDeleteImpactDto, TerritoryDeleteResultDto } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import type { DeletionScope, TerritoryDeletionStorePort, TerritoryKind } from '../../domain/territoryDeletion.js';

/** What other modules hold that points at the doomed items: counted by the composition root from their public contracts. */
export interface TerritoryReferences {
  doctors: number;
  chemists: number;
  distributors: number;
  holidays: number;
  plannedDays: number;
}
export type ReferenceCounter = (scope: { zoneIds: string[]; hqIds: string[]; routeIds: string[] }) => Promise<TerritoryReferences>;

const NO_REFERENCES: TerritoryReferences = { doctors: 0, chemists: 0, distributors: 0, holidays: 0, plannedDays: 0 };
const NAMES_SHOWN = 8;

const idsOf = (scope: DeletionScope) => ({
  zoneIds: scope.zones.map((z) => z.id),
  hqIds: scope.hqs.map((h) => h.id),
  routeIds: scope.routes.map((r) => r.id),
});

/**
 * Permanent delete of a Zone, HQ or Route, with everything under it (decision-log 2026-10-16). A warning, never a block: `impact` says what
 * it would take and touch so Admin can confirm, `delete` then does it. What other modules hold that points at the items is not touched: a
 * doctor keeps its route id (and needs a new route), history keeps showing the old name from the archive.
 */
export class TerritoryDeletionUseCase {
  private counter: ReferenceCounter = async () => NO_REFERENCES;

  constructor(private readonly store: TerritoryDeletionStorePort) {}

  /** Bound by the composition root once the modules above Territory exist. */
  bindReferenceCounter(counter: ReferenceCounter): void {
    this.counter = counter;
  }

  private async scopeOf(kind: TerritoryKind, id: string): Promise<DeletionScope> {
    const scope = await this.store.resolve(kind, id);
    if (!scope) throw AppError.notFound();
    return scope;
  }

  async impact(kind: TerritoryKind, id: string): Promise<TerritoryDeleteImpactDto> {
    const scope = await this.scopeOf(kind, id);
    const [people, references] = await Promise.all([this.store.countPeople(scope), this.counter(idsOf(scope))]);
    const extraHqs = kind === 'ZONE' ? scope.hqs : [];
    const extraRoutes = kind === 'ROUTE' ? [] : scope.routes;
    return {
      kind,
      id,
      name: scope.name,
      alsoDeleted: { zones: 0, hqs: extraHqs.length, routes: extraRoutes.length },
      alsoDeletedNames: [...extraHqs.map((h) => h.name), ...extraRoutes.map((r) => r.name)].slice(0, NAMES_SHOWN),
      people,
      references,
    };
  }

  async delete(kind: TerritoryKind, id: string, actorId: string): Promise<TerritoryDeleteResultDto> {
    const scope = await this.scopeOf(kind, id);
    await this.store.remove(scope, actorId, randomUUID());
    return { deleted: { zones: scope.zones.length, hqs: scope.hqs.length, routes: scope.routes.length } };
  }
}
