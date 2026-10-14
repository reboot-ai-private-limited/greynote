'use client';

import type { RouteDto, UpdateRouteDto } from '@greynote/contracts';
import { toast } from '@/components/ui/toast';
import { assignmentsApi, routesApi } from '@/lib/api/endpoints/territory';
import { keys } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';
import type { CreateRouteDto } from '@greynote/contracts';

/** Every route write may change the list, the detail and the assignments, so it refreshes the lot. */
const invalidates = () => [keys.routes.all()];

/** The server sets the type from the km; when a chosen type disagrees with it, say so beside the success. */
export function announceRoute(route: RouteDto, saved: string): void {
  toast.success(route.typeWarning ? `${saved} Note: ${route.typeWarning}` : saved);
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
    onSuccess: (route) => {
      announceRoute(route, 'Route updated.');
      onDone?.();
    },
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
