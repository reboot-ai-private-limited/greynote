import { narrowToTeam } from '@/shared/access/teamScope.js';
import type { DownlineEntry, TeamDirectoryPort } from '../domain/ports.js';

export type TeamLevel = 'direct' | 'indirect' | 'all';

/**
 * The manager's active people at the chosen level, nearest first then by name (as `getDownline` returns them). With `userId`, just that
 * person — who must be in the downline whatever the level (403 otherwise), and is shown even if they have since left.
 */
export async function activeMembers(
  directory: TeamDirectoryPort,
  managerId: string,
  level: TeamLevel,
  userId?: string,
): Promise<DownlineEntry[]> {
  const downline = await directory.getDownline(managerId);
  if (userId !== undefined) {
    const [id] = narrowToTeam(
      downline.map((m) => m.id),
      userId,
    );
    return downline.filter((m) => m.id === id);
  }
  return downline.filter(
    (m) =>
      m.status === 'active' &&
      (level === 'all' || (level === 'direct' ? m.depth === 1 : m.depth > 1)),
  );
}
