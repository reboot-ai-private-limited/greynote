import { Router, type RequestHandler } from 'express';
import { AppError } from '@/shared/errors/AppError.js';
import { rateLimit } from 'express-rate-limit';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { validate } from '@/shared/http/validate.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import {
  deleteAccountBodySchema,
  deleteAccountPublicBodySchema,
  loginBodySchema,
  logoutAllBodySchema,
  logoutBodySchema,
  pushTokenBodySchema,
  pushTokenClearBodySchema,
  refreshBodySchema,
} from './auth.schemas.js';
import type {
  makeDeleteAccountController,
  makeDeleteAccountPublicController,
  makeLoginController,
  makeLogoutAllController,
  makeLogoutController,
  makeMeController,
  makePushTokenController,
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

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/identity/auth/delete-account-public',
  tags: ['Identity / Auth'],
  summary:
    'Public deletion page on the company website (Google Play URL): employee code + password, no session. FIELD only; rate limited',
  request: { body: { content: { 'application/json': { schema: deleteAccountPublicBodySchema } } } },
  responses: {
    200: { description: 'Account deleted' },
    401: { description: 'Invalid employee code or password' },
    409: { description: 'Manager still has active reports (reason HAS_ACTIVE_REPORTS), or already deleted' },
    429: { description: 'Too many attempts' },
  },
});

openApiRegistry.registerPath({
  method: 'put',
  path: '/api/identity/auth/push-token',
  tags: ['Identity / Auth'],
  summary:
    "Save this phone's Firebase (FCM) token on its live session. Call after login and whenever Firebase rotates the token. The same token on another account is moved here",
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: pushTokenBodySchema } } } },
  responses: { 200: { description: 'Saved' }, 404: { description: 'No live session for this deviceId' } },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/api/identity/auth/push-token',
  tags: ['Identity / Auth'],
  summary: 'Stop pushes to this phone (user turned notifications off). Logout does this by itself',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: pushTokenClearBodySchema } } } },
  responses: { 200: { description: 'Removed (also when there was nothing to remove)' } },
});

const tooMany: RequestHandler = (_req, _res, next) =>
  next(
    new AppError({
      statusCode: 429,
      code: 'FORBIDDEN',
      message: 'Too many attempts. Try again in 15 minutes.',
      publicDetails: { reason: 'RATE_LIMITED' },
    }),
  );
const WINDOW_MS = 15 * 60 * 1000;

/** A public door that checks passwords and then destroys data: capped per address and per employee code. */
function deletePublicLimiters() {
  return [
    rateLimit({ windowMs: WINDOW_MS, limit: 5, standardHeaders: true, legacyHeaders: false, handler: tooMany }),
    rateLimit({
      windowMs: WINDOW_MS,
      limit: 5,
      standardHeaders: true,
      legacyHeaders: false,
      handler: tooMany,
      keyGenerator: (req) => `code:${String(req.body?.employeeCode ?? '').trim().toLowerCase()}`,
      validate: { keyGeneratorIpFallback: false },
    }),
  ];
}

export function buildAuthRouter(controllers: {
  login: ReturnType<typeof makeLoginController>;
  refresh: ReturnType<typeof makeRefreshController>;
  logout: ReturnType<typeof makeLogoutController>;
  logoutAll: ReturnType<typeof makeLogoutAllController>;
  me: ReturnType<typeof makeMeController>;
  deleteAccount: ReturnType<typeof makeDeleteAccountController>;
  deleteAccountPublic: ReturnType<typeof makeDeleteAccountPublicController>;
  pushToken: ReturnType<typeof makePushTokenController>;
}): Router {
  const router = Router();

  router.post('/login', validate({ body: loginBodySchema }), controllers.login);
  router.post('/refresh', validate({ body: refreshBodySchema }), controllers.refresh);
  router.post('/logout', authenticate(), validate({ body: logoutBodySchema }), controllers.logout);
  router.get('/me', authenticate(), controllers.me);
  router.put('/push-token', authenticate(), validate({ body: pushTokenBodySchema }), controllers.pushToken.register);
  router.delete('/push-token', authenticate(), validate({ body: pushTokenClearBodySchema }), controllers.pushToken.unregister);
  router.post('/delete-account', authenticate(), validate({ body: deleteAccountBodySchema }), controllers.deleteAccount);
  router.post(
    '/delete-account-public',
    ...deletePublicLimiters(),
    validate({ body: deleteAccountPublicBodySchema }),
    controllers.deleteAccountPublic,
  );
  router.post(
    '/logout-all',
    authenticate(),
    requireRole('ADMIN'),
    validate({ body: logoutAllBodySchema }),
    controllers.logoutAll,
  );

  return router;
}
