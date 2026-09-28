import { AppError } from '@/shared/errors/AppError.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { UserHqAssignment } from '../../domain/userHqAssignment.entity.js';
import type { UserHqAssignmentRepositoryPort } from '../../domain/userHqAssignment.repository.port.js';

export interface UserHqView extends UserHqAssignment {
  hqName: string | null;
  zoneId: string | null;
}

/** An employee's HQ: `current` for other modules (with its Zone), `history` for the admin screen. */
export class GetUserHqUseCase {
  constructor(
    private readonly assignments: UserHqAssignmentRepositoryPort,
    private readonly hqs: HqRepositoryPort,
  ) {}

  /** What HR's holidays need: the active HQ and its Zone, or `null`. */
  async current(userId: string): Promise<{ hqId: string; zoneId: string } | null> {
    const active = await this.assignments.findActive(userId);
    if (!active) return null;
    const hq = await this.hqs.findById(active.hqId);
    if (!hq) throw AppError.internal('INTERNAL', { reason: 'HQ_NOT_FOUND', hqId: active.hqId });
    return { hqId: hq.id, zoneId: hq.zoneId };
  }

  async history(userId: string): Promise<UserHqView[]> {
    const rows = await this.assignments.listForUser(userId);
    const hqs = new Map(
      (await Promise.all([...new Set(rows.map((r) => r.hqId))].map((id) => this.hqs.findById(id))))
        .filter((h) => h !== null)
        .map((h) => [h.id, h]),
    );
    return rows.map((r) => ({ ...r, hqName: hqs.get(r.hqId)?.name ?? null, zoneId: hqs.get(r.hqId)?.zoneId ?? null }));
  }
}
