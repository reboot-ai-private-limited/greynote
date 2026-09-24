import { Router } from 'express';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import type {
  makeApproveDeviceController,
  makeListPendingDevicesController,
  makeListUserDevicesController,
  makeLogoutDeviceController,
  makeRejectDeviceController,
  makeRemoveDeviceController,
} from './devices.controller.js';
import { userDeviceParamsSchema, userDevicesParamsSchema } from './devices.schemas.js';

const TAG = 'Identity / Devices';
const deviceAction = (method: 'post' | 'delete', path: string, summary: string) =>
  openApiRegistry.registerPath({
    method,
    path: `/api/identity/users/{id}/devices/{deviceRowId}${path}`,
    tags: [TAG],
    summary,
    security: [{ bearerAuth: [] }],
    request: { params: userDeviceParamsSchema },
    responses: { 200: { description: 'Done' }, 404: { description: 'No such device for this user' }, 409: { description: 'Wrong status for this action' } },
  });

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/identity/devices/pending',
  tags: [TAG],
  summary: 'Admin: field-employee devices waiting for approval, oldest first',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Pending device requests' } },
});
openApiRegistry.registerPath({
  method: 'get',
  path: '/api/identity/users/{id}/devices',
  tags: [TAG],
  summary: "Admin: an employee's devices (all statuses) and whether each is logged in",
  security: [{ bearerAuth: [] }],
  request: { params: userDevicesParamsSchema },
  responses: { 200: { description: 'Devices listed' } },
});
deviceAction('post', '/approve', 'Admin: approve a pending device');
deviceAction('post', '/reject', 'Admin: reject a pending device (blocked until REJECTED_DEVICE_TTL_DAYS pass)');
deviceAction('delete', '', 'Admin: remove a registered device and end its sessions (frees a slot)');
deviceAction('post', '/logout', 'Admin: log a registered device out; it stays registered');

/** Mounted at the identity root: owns `/devices/*` and `/users/:id/devices/*`. */
export function buildDevicesRouter(controllers: {
  listPending: ReturnType<typeof makeListPendingDevicesController>;
  listForUser: ReturnType<typeof makeListUserDevicesController>;
  approve: ReturnType<typeof makeApproveDeviceController>;
  reject: ReturnType<typeof makeRejectDeviceController>;
  remove: ReturnType<typeof makeRemoveDeviceController>;
  logout: ReturnType<typeof makeLogoutDeviceController>;
}): Router {
  const router = Router();
  const admin = [authenticate(), requireRole('ADMIN')];
  const oneDevice = validate({ params: userDeviceParamsSchema });

  router.get('/devices/pending', ...admin, controllers.listPending);
  router.get('/users/:id/devices', ...admin, validate({ params: userDevicesParamsSchema }), controllers.listForUser);
  router.post('/users/:id/devices/:deviceRowId/approve', ...admin, oneDevice, controllers.approve);
  router.post('/users/:id/devices/:deviceRowId/reject', ...admin, oneDevice, controllers.reject);
  router.delete('/users/:id/devices/:deviceRowId', ...admin, oneDevice, controllers.remove);
  router.post('/users/:id/devices/:deviceRowId/logout', ...admin, oneDevice, controllers.logout);

  return router;
}
