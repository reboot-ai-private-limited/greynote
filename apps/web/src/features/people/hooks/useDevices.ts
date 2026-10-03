'use client';

import type { UserDeviceDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { identityApi } from '@/lib/api/endpoints/identity';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';
import { ACTION_PAST, type DeviceAction } from '../lib/devices';

/** Every phone awaiting approval, org-wide. Shares its key with the dashboard tile, so they stay in step. */
export function usePendingDevices() {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.devices.pending(),
      fetch: (token, signal) => identityApi.pendingDevices(token, signal),
      staleTime: staleTime.live,
    }),
  );
}

export function useUserDevices(userId: string) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.devices.forUser(userId),
      fetch: (token, signal) => identityApi.userDevices(token, userId, signal),
      staleTime: staleTime.live,
    }),
  );
}

export interface DeviceTarget {
  userId: string;
  deviceRowId: string;
}

/**
 * One mutation for the four device actions. A decision changes the queue, the employee's list and
 * (through a slot freed or taken) other pending requests, so everything under `devices` refetches.
 */
export function useDeviceAction(action: DeviceAction, onDone: () => void) {
  return useApiMutation<DeviceTarget, UserDeviceDto | Record<string, never>>({
    call: (token, { userId, deviceRowId }) => {
      switch (action) {
        case 'approve':
        case 'reject':
          return identityApi.decideDevice(token, userId, deviceRowId, action);
        case 'remove':
          return identityApi.removeDevice(token, userId, deviceRowId);
        case 'logout':
          return identityApi.logoutDevice(token, userId, deviceRowId);
      }
    },
    invalidates: [keys.devices.all()],
    successMessage: ACTION_PAST[action],
    onSuccess: onDone,
  });
}
