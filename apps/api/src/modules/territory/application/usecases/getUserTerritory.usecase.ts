import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { UserHqAssignmentRepositoryPort } from '../../domain/userHqAssignment.repository.port.js';

export interface UserTerritory {
  hqIds: string[];
  zoneIds: string[];
}

/**
 * Where an employee is based, for HR's holidays: their one main HQ and its Zone (decision-log 2026-11-26: one HQ for every designation; a
 * manager's old multi-HQ coverage no longer counts). `null` with no HQ set: only the national holidays apply.
 */
export class GetUserTerritoryUseCase {
  /** Each person's answer for a minute (2026-11-27): calendars and reports ask for many people, often twice; HQ moves are rare. */
  private readonly recent = new Map<string, { at: number; value: Promise<UserTerritory | null> }>();

  constructor(
    private readonly userHqs: UserHqAssignmentRepositoryPort,
    private readonly hqs: HqRepositoryPort,
    private readonly ttlMs = 60_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  execute(userId: string): Promise<UserTerritory | null> {
    const hit = this.recent.get(userId);
    if (hit && this.now() - hit.at < this.ttlMs) return hit.value;
    const value = this.read(userId);
    this.recent.set(userId, { at: this.now(), value });
    // A failed read is not remembered.
    value.catch(() => this.recent.delete(userId));
    if (this.recent.size > 10_000) this.recent.delete(this.recent.keys().next().value as string);
    return value;
  }

  /** Someone's HQ changed: their next read goes to the database. */
  forget(userId: string): void {
    this.recent.delete(userId);
  }

  private async read(userId: string): Promise<UserTerritory | null> {
    const active = await this.userHqs.findActive(userId);
    const hq = active ? await this.hqs.findById(active.hqId) : null;
    return hq ? { hqIds: [hq.id], zoneIds: [hq.zoneId] } : null;
  }
}
