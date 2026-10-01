'use client';

import type { TerritoryStatus, UpdateAreaDto, UpdateZoneDto } from '@greynote/contracts';
import { areasApi, hqsApi, zonesApi } from '@/lib/api/endpoints/territory';
import { useApiMutation } from '@/lib/query/mutation';
import { keys } from '@/lib/query/keys';
import type { CreateAreaDto, CreateHqDto, CreateZoneDto } from '@greynote/contracts';

/**
 * Writes for the three levels. Zones, HQs and Areas reference each other, so a change at one level
 * invalidates all three lists (a renamed zone shows in the HQ table's zone column).
 */
const invalidates = () => [keys.zones.all(), keys.hqs.all(), keys.areas.all()];

export function useCreateZone(onDone: () => void) {
  return useApiMutation<CreateZoneDto>({
    call: (token, body) => zonesApi.create(token, body),
    invalidates: invalidates(),
    successMessage: 'Zone created.',
    onSuccess: onDone,
  });
}
export function useUpdateZone(onDone?: () => void) {
  return useApiMutation<{ id: string; body: UpdateZoneDto }>({
    call: (token, { id, body }) => zonesApi.update(token, id, body),
    invalidates: invalidates(),
    successMessage: 'Zone updated.',
    ...(onDone && { onSuccess: onDone }),
  });
}

export function useCreateHq(onDone: () => void) {
  return useApiMutation<CreateHqDto>({
    call: (token, body) => hqsApi.create(token, body),
    invalidates: invalidates(),
    successMessage: 'HQ created.',
    onSuccess: onDone,
  });
}
export function useUpdateHq(onDone?: () => void) {
  return useApiMutation<{ id: string; body: UpdateZoneDto }>({
    call: (token, { id, body }) => hqsApi.update(token, id, body),
    invalidates: invalidates(),
    successMessage: 'HQ updated.',
    ...(onDone && { onSuccess: onDone }),
  });
}

export function useCreateArea(onDone: () => void) {
  return useApiMutation<CreateAreaDto>({
    call: (token, body) => areasApi.create(token, body),
    invalidates: invalidates(),
    successMessage: 'Area created.',
    onSuccess: onDone,
  });
}
export function useUpdateArea(onDone?: () => void) {
  return useApiMutation<{ id: string; body: UpdateAreaDto }>({
    call: (token, { id, body }) => areasApi.update(token, id, body),
    invalidates: invalidates(),
    successMessage: 'Area updated.',
    ...(onDone && { onSuccess: onDone }),
  });
}

export const STATUS_LABEL: Record<TerritoryStatus, string> = { active: 'Active', inactive: 'Inactive' };
