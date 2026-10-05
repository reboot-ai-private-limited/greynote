'use client';

import type { RouteDto, UpdateRouteDto, UpdateDestinationDto } from '@greynote/contracts';
import { toast } from '@/components/ui/toast';
import { assignmentsApi, routesApi } from '@/lib/api/endpoints/territory';
import { keys } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';
import type { CreateRouteDto } from '@greynote/contracts';

/** Every route write may change the list, the detail and the assignments, so it refreshes the lot. */
const invalidates = () => [keys.routes.all()];

/**
 * The API reports a failed Google distance calculation as a SUCCESS with `distanceStatus: FAILED`,
 * so the HTTP status cannot be trusted: every response that may have recalculated is checked here.
 */
export function announceRoute(route: RouteDto, saved: string): void {
  if (route.distanceStatus === 'FAILED') {
    toast.error(`${saved} But the distance could not be calculated — open the route and retry.`);
  } else {
    toast.success(route.typeWarning ? `${saved} Note: ${route.typeWarning}` : saved);
  }
}

export function useCreateRoute(onCreated: (route: RouteDto) => void) {
  return useApiMutation<CreateRouteDto, RouteDto>({
    call: (token, body) => routesApi.create(token, body),
    invalidates: invalidates(),
    onSuccess: (route) => {
      announceRoute(route, 'Route created.');
      onCreated(route);
    },
  });
}

export function useUpdateRoute(id: string, onDone?: () => void) {
  return useApiMutation<UpdateRouteDto, RouteDto>({
    call: (token, body) => routesApi.update(token, id, body),
    invalidates: invalidates(),
    successMessage: 'Route updated.',
    ...(onDone && { onSuccess: onDone }),
  });
}

export function useSaveDestination(id: string) {
  return useApiMutation<UpdateDestinationDto, RouteDto>({
    call: (token, body) => routesApi.saveDestination(token, id, body),
    invalidates: invalidates(),
    onSuccess: (route) => announceRoute(route, 'Destination saved.'),
  });
}

export function useRecalculate(id: string) {
  return useApiMutation<void, RouteDto>({
    call: (token) => routesApi.recalculate(token, id),
    invalidates: invalidates(),
    onSuccess: (route) =>
      route.distanceStatus === 'FAILED'
        ? toast.error('The distance still could not be calculated. Try again, or enter it manually.')
        : toast.success('Distance recalculated.'),
  });
}

export function useSetDistance(id: string, onDone: () => void) {
  return useApiMutation<string, RouteDto>({
    call: (token, distanceKm) => routesApi.setDistance(token, id, distanceKm),
    invalidates: invalidates(),
    successMessage: 'Distance set manually.',
    onSuccess: onDone,
  });
}

export function useAssignMr(routeId: string, onDone: () => void) {
  return useApiMutation<string>({
    call: (token, userId) => assignmentsApi.assign(token, routeId, userId),
    invalidates: invalidates(),
    successMessage: 'MR assigned.',
    onSuccess: onDone,
  });
}

export function useUnassignMr(routeId: string, onDone: () => void) {
  return useApiMutation<string>({
    call: (token, userId) => assignmentsApi.unassign(token, routeId, userId),
    invalidates: invalidates(),
    successMessage: 'MR unassigned.',
    onSuccess: onDone,
  });
}
