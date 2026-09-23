import { Router } from 'express';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { validate } from '@/shared/http/validate.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import {
  loginBodySchema,
  logoutAllBodySchema,
  logoutBodySchema,
  refreshBodySchema,
} from './auth.schemas.js';
import type {
  makeLoginController,
  makeLogoutAllController,
  makeLogoutController,
  makeRefreshController,
} from './auth.controller.js';

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/identity/auth/login',
  summary: 'Log in with employee code + password',
  request: { body: { content: { 'application/json': { schema: loginBodySchema } } } },
  responses: {
    200: { description: 'Tokens issued' },
    401: { description: 'Invalid credentials' },
    409: { description: 'FIELD-role device limit reached' },
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/identity/auth/refresh',
  summary: 'Rotate a session using its refresh token',
  request: { body: { content: { 'application/json': { schema: refreshBodySchema } } } },
  responses: {
    200: { description: 'New token pair issued' },
    401: { description: 'Invalid, expired, or reused refresh token' },
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/identity/auth/logout',
  summary: "Revoke the caller's own session",
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: logoutBodySchema } } } },
  responses: { 200: { description: 'Session revoked' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/identity/auth/logout-all',
  summary: 'Admin: revoke every session for a target user (offboarding)',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: logoutAllBodySchema } } } },
  responses: { 200: { description: 'Every session revoked' } },
});

export function buildAuthRouter(controllers: {
  login: ReturnType<typeof makeLoginController>;
  refresh: ReturnType<typeof makeRefreshController>;
  logout: ReturnType<typeof makeLogoutController>;
  logoutAll: ReturnType<typeof makeLogoutAllController>;
}): Router {
  const router = Router();

  router.post('/login', validate({ body: loginBodySchema }), controllers.login);
  router.post('/refresh', validate({ body: refreshBodySchema }), controllers.refresh);
  router.post('/logout', authenticate(), validate({ body: logoutBodySchema }), controllers.logout);
  router.post(
    '/logout-all',
    authenticate(),
    requireRole('ADMIN'),
    validate({ body: logoutAllBodySchema }),
    controllers.logoutAll,
  );

  return router;
}
