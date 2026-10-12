import type { InboxAudienceDto } from '@greynote/contracts';
import type { Recipient } from './ports.js';

export const isEmptyAudience = (a: InboxAudienceDto): boolean =>
  !a.everyone && !a.roles.length && !a.zoneIds.length && !a.hqIds.length && !a.userIds.length;

/**
 * Who an audience reaches: anyone matching any one of its parts, once. Zones and HQs match field
 * employees only (the only people who have one). `everyone` is every active user.
 */
export function resolveAudience(audience: InboxAudienceDto, people: Recipient[]): string[] {
  if (audience.everyone) return people.map((p) => p.id);
  const roles = new Set(audience.roles);
  const zones = new Set(audience.zoneIds);
  const hqs = new Set(audience.hqIds);
  const users = new Set(audience.userIds);
  return people
    .filter((p) => users.has(p.id) || roles.has(p.role) || (p.zoneId !== null && zones.has(p.zoneId)) || (p.hqId !== null && hqs.has(p.hqId)))
    .map((p) => p.id);
}
