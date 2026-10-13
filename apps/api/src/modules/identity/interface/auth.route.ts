import { Router } from 'express';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { validate } from '@/shared/http/validate.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import {
  deleteAccountBodySchema,
  loginBodySchema,
  logoutAllBodySchema,
  logoutBodySchema,
  refreshBodySchema,
} from './auth.schemas.js';
import type {
  makeDeleteAccountController,
  makeLoginController,
  makeLogoutAllController,
  makeLogoutController,
  makeMeController,
  makeRefreshController,
} from './auth.controller.js';

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/identity/auth/login',
  tags: ['Identity / Auth'],
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
  tags: ['Identity / Auth'],
  summary:
    'Rotate a session. Refresh token comes from the body (mobile) or the httpOnly cookie (browser, needs X-Client header)',
  request: { body: { content: { 'application/json': { schema: refreshBodySchema } } } },
  responses: {
    200: { description: 'New token pair issued' },
    401: { description: 'Invalid, expired, or reused refresh token' },
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/identity/auth/logout',
  tags: ['Identity / Auth'],
  summary: "Revoke the caller's own session",
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: logoutBodySchema } } } },
  responses: { 200: { description: 'Session revoked' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/identity/auth/me',
  tags: ['Identity / Auth'],
  summary: 'The signed-in user (role, name, status) — used by the web portal at boot',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'The caller as a UserSummary' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/identity/auth/logout-all',
  tags: ['Identity / Auth'],
  summary: 'Admin: revoke every session for a target user (offboarding)',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: logoutAllBodySchema } } } },
  responses: { 200: { description: 'Every session revoked' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/identity/auth/delete-account',
  tags: ['Identity / Auth'],
  summary:
    'Delete my own account (FIELD). Re-confirms the password, scrubs personal data, ends every session; payroll and activity records are kept',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: deleteAccountBodySchema } } } },
  responses: {
    200: { description: 'Account deleted' },
    403: { description: 'Wrong password' },
    409: { description: 'Manager still has active reports (reason HAS_ACTIVE_REPORTS)' },
  },
});

export function buildAuthRouter(controllers: {
  login: ReturnType<typeof makeLoginController>;
  refresh: ReturnType<typeof makeRefreshController>;
  logout: ReturnType<typeof makeLogoutController>;
  logoutAll: ReturnType<typeof makeLogoutAllController>;
  me: ReturnType<typeof makeMeController>;
  deleteAccount: ReturnType<typeof makeDeleteAccountController>;
}): Router {
  const router = Router();

  router.post('/login', validate({ body: loginBodySchema }), controllers.login);
  router.post('/refresh', validate({ body: refreshBodySchema }), controllers.refresh);
  router.post('/logout', authenticate(), validate({ body: logoutBodySchema }), controllers.logout);
  router.get('/me', authenticate(), controllers.me);
  router.post('/delete-account', authenticate(), validate({ body: deleteAccountBodySchema }), controllers.deleteAccount);
  router.post(
    '/logout-all',
    authenticate(),
    requireRole('ADMIN'),
    validate({ body: logoutAllBodySchema }),
    controllers.logoutAll,
  );

  return router;
}
