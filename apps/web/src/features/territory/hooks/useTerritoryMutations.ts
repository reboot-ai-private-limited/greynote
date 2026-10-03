'use client';

import type { TerritoryStatus, UpdateHqDto, UpdateHqResultDto, UpdateZoneDto } from '@greynote/contracts';
import { toast } from '@/components/ui/toast';
import { hqsApi, zonesApi } from '@/lib/api/endpoints/territory';
import { useApiMutation } from '@/lib/query/mutation';
import { keys } from '@/lib/query/keys';
import type { CreateHqDto, CreateZoneDto } from '@greynote/contracts';
import { describeRecalculation } from '../lib/recalculation';

/**
 * Writes for Zones and HQs. They reference each other, so a change at one level invalidates both
 * lists (a renamed zone shows in the HQ table's zone column). An HQ's base place also moves its
 * routes' distances, so HQ writes refresh the routes too.
 */
const invalidates = () => [keys.zones.all(), keys.hqs.all(), keys.routes.all()];

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
  return useApiMutation<{ id: string; body: UpdateHqDto }, UpdateHqResultDto>({
    call: (token, { id, body }) => hqsApi.update(token, id, body),
    invalidates: invalidates(),
    // A base-place change reports what it did to the HQ's routes; that is the message.
    onSuccess: (hq) => {
      const { message, tone } = describeRecalculation(hq.routeRecalculation);
      if (tone === 'error') toast.error(message);
      else toast.success(message);
      onDone?.();
    },
  });
}

export const STATUS_LABEL: Record<TerritoryStatus, string> = { active: 'Active', inactive: 'Inactive' };
