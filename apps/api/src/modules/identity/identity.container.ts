import { Router } from 'express';
import { env } from '@/config/env.js';
import { CreateDesignationUseCase } from './application/usecases/createDesignation.usecase.js';
import { CreatePayBandUseCase } from './application/usecases/createPayBand.usecase.js';
import { CreateRoleUseCase } from './application/usecases/createRole.usecase.js';
import { CreateUserUseCase } from './application/usecases/createUser.usecase.js';
import { GetActiveDeviceCountUseCase } from './application/usecases/getActiveDeviceCount.usecase.js';
import { GetManagerChainUseCase } from './application/usecases/getManagerChain.usecase.js';
import { GetPayBandRatesUseCase } from './application/usecases/getPayBandRates.usecase.js';
import { GetUserSummaryUseCase } from './application/usecases/getUserSummary.usecase.js';
import { IsFieldRoleUseCase } from './application/usecases/isFieldRole.usecase.js';
import { ListDesignationsUseCase } from './application/usecases/listDesignations.usecase.js';
import { ListPayBandsUseCase } from './application/usecases/listPayBands.usecase.js';
import { ListRolesUseCase } from './application/usecases/listRoles.usecase.js';
import { ListUsersUseCase } from './application/usecases/listUsers.usecase.js';
import { LoginUseCase } from './application/usecases/login.usecase.js';
import { LogoutUseCase } from './application/usecases/logout.usecase.js';
import { LogoutAllSessionsUseCase } from './application/usecases/logoutAllSessions.usecase.js';
import { RefreshSessionUseCase } from './application/usecases/refreshSession.usecase.js';
import { RemoveUserDocumentUseCase } from './application/usecases/removeUserDocument.usecase.js';
import { SeedBootstrapAdminUseCase } from './application/usecases/seedBootstrapAdmin.usecase.js';
import { SeedDefaultRolesUseCase } from './application/usecases/seedDefaultRoles.usecase.js';
import { UnblockUserUseCase } from './application/usecases/unblockUser.usecase.js';
import { UpdateDesignationUseCase } from './application/usecases/updateDesignation.usecase.js';
import { UpdatePayBandUseCase } from './application/usecases/updatePayBand.usecase.js';
import { UpdateRoleUseCase } from './application/usecases/updateRole.usecase.js';
import { UpdateUserUseCase } from './application/usecases/updateUser.usecase.js';
import { UploadUserDocumentUseCase } from './application/usecases/uploadUserDocument.usecase.js';
import type { ConfigProviderPort } from './domain/configProvider.port.js';
import { BcryptPasswordHasher } from './infrastructure/bcryptPasswordHasher.adapter.js';
import { CloudinaryDocumentStorage } from './infrastructure/cloudinaryDocumentStorage.adapter.js';
import { CryptoRefreshTokenGenerator } from './infrastructure/cryptoRefreshTokenGenerator.adapter.js';
import { JwtAccessTokenSigner } from './infrastructure/jwtAccessTokenSigner.adapter.js';
import { MongoDesignationAdapter } from './infrastructure/mongoDesignation.adapter.js';
import { MongoPayBandAdapter } from './infrastructure/mongoPayBand.adapter.js';
import { MongoRoleAdapter } from './infrastructure/mongoRole.adapter.js';
import { MongoUserAdapter } from './infrastructure/mongoUser.adapter.js';
import { MongoUserSessionAdapter } from './infrastructure/mongoUserSession.adapter.js';
import {
  makeLoginController,
  makeLogoutAllController,
  makeLogoutController,
  makeRefreshController,
} from './interface/auth.controller.js';
import { buildAuthRouter } from './interface/auth.route.js';
import { buildDesignationsRouter } from './interface/designations.route.js';
import { buildPayBandsRouter } from './interface/payBands.route.js';
import { buildRolesRouter } from './interface/roles.route.js';
import {
  makeCreateUserController,
  makeListUsersController,
  makeRemoveUserDocumentController,
  makeUnblockUserController,
  makeUpdateUserController,
  makeUploadUserDocumentController,
} from './interface/users.controller.js';
import { buildUsersRouter } from './interface/users.route.js';
import type { IdentityPublicContract } from './identity.public.js';

export interface IdentityContainer {
  contract: IdentityPublicContract;
  buildRouter: () => Router;
  /** Idempotent — seeds the 4 fixed Role rows, then the bootstrap Admin if none exists. Call once at boot. */
  seedBootstrapAdmin: () => Promise<void>;
}

export function buildIdentityContainer(configProvider: ConfigProviderPort): IdentityContainer {
  // 1. Adapters
  const roleRepository = new MongoRoleAdapter();
  const designationRepository = new MongoDesignationAdapter();
  const payBandRepository = new MongoPayBandAdapter();
  const userRepository = new MongoUserAdapter();
  const userSessionRepository = new MongoUserSessionAdapter();
  const passwordHasher = new BcryptPasswordHasher(env.BCRYPT_COST_FACTOR);
  const accessTokenSigner = new JwtAccessTokenSigner();
  const refreshTokenGenerator = new CryptoRefreshTokenGenerator();
  const documentStorage = new CloudinaryDocumentStorage();

  const tokenOpts = {
    accessTokenTtlSeconds: env.JWT_ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlDays: env.JWT_REFRESH_TOKEN_TTL_DAYS,
  };

  // 2. Use cases
  const login = new LoginUseCase(
    userRepository,
    roleRepository,
    userSessionRepository,
    passwordHasher,
    accessTokenSigner,
    refreshTokenGenerator,
    configProvider,
    tokenOpts,
  );
  const refreshSession = new RefreshSessionUseCase(
    userRepository,
    roleRepository,
    userSessionRepository,
    accessTokenSigner,
    refreshTokenGenerator,
    tokenOpts,
  );
  const logout = new LogoutUseCase(userSessionRepository, refreshTokenGenerator);
  const logoutAllSessions = new LogoutAllSessionsUseCase(userRepository, userSessionRepository);

  const createUser = new CreateUserUseCase(
    userRepository,
    roleRepository,
    designationRepository,
    payBandRepository,
    passwordHasher,
  );
  const updateUser = new UpdateUserUseCase(userRepository, roleRepository, designationRepository, payBandRepository);
  const listUsers = new ListUsersUseCase(userRepository, roleRepository);
  const uploadUserDocument = new UploadUserDocumentUseCase(userRepository, roleRepository, documentStorage);
  const removeUserDocument = new RemoveUserDocumentUseCase(userRepository, documentStorage);
  const unblockUser = new UnblockUserUseCase(userRepository);

  const createRole = new CreateRoleUseCase(roleRepository);
  const listRoles = new ListRolesUseCase(roleRepository);
  const updateRole = new UpdateRoleUseCase(roleRepository);

  const createDesignation = new CreateDesignationUseCase(designationRepository);
  const listDesignations = new ListDesignationsUseCase(designationRepository);
  const updateDesignation = new UpdateDesignationUseCase(designationRepository);

  const createPayBand = new CreatePayBandUseCase(payBandRepository);
  const listPayBands = new ListPayBandsUseCase(payBandRepository);
  const updatePayBand = new UpdatePayBandUseCase(payBandRepository);

  const getUserSummary = new GetUserSummaryUseCase(userRepository, roleRepository);
  const getManagerChain = new GetManagerChainUseCase(userRepository, roleRepository);
  const isFieldRole = new IsFieldRoleUseCase(userRepository, roleRepository);
  const getPayBandRates = new GetPayBandRatesUseCase(userRepository, payBandRepository);
  const getActiveDeviceCount = new GetActiveDeviceCountUseCase(userRepository, userSessionRepository);

  const seedDefaultRoles = new SeedDefaultRolesUseCase(roleRepository);
  const seedBootstrapAdminUseCase = new SeedBootstrapAdminUseCase(userRepository, roleRepository, passwordHasher);

  // 3. Controllers
  const authControllers = {
    login: makeLoginController(login),
    refresh: makeRefreshController(refreshSession),
    logout: makeLogoutController(logout),
    logoutAll: makeLogoutAllController(logoutAllSessions),
  };
  const usersControllers = {
    list: makeListUsersController(listUsers),
    create: makeCreateUserController(createUser),
    update: makeUpdateUserController(updateUser),
    uploadDocument: makeUploadUserDocumentController(uploadUserDocument),
    removeDocument: makeRemoveUserDocumentController(removeUserDocument),
    unblock: makeUnblockUserController(unblockUser),
  };

  return {
    contract: {
      login: (input) => login.execute(input),
      refresh: (refreshToken) => refreshSession.execute(refreshToken),
      logout: (callerUserId, refreshToken) => logout.execute(callerUserId, refreshToken),
      getUserSummary: (userId) => getUserSummary.execute(userId),
      getManagerChain: (userId) => getManagerChain.execute(userId),
      isFieldRole: (userId) => isFieldRole.execute(userId),
      getPayBandRates: (userId) => getPayBandRates.execute(userId),
      getActiveDeviceCount: (userId) => getActiveDeviceCount.execute(userId),
    },

    buildRouter: () => {
      const router = Router();
      router.use('/auth', buildAuthRouter(authControllers));
      router.use('/users', buildUsersRouter(usersControllers));
      router.use('/roles', buildRolesRouter({ list: listRoles, create: createRole, update: updateRole }));
      router.use(
        '/designations',
        buildDesignationsRouter({ list: listDesignations, create: createDesignation, update: updateDesignation }),
      );
      router.use(
        '/pay-bands',
        buildPayBandsRouter({ list: listPayBands, create: createPayBand, update: updatePayBand }),
      );
      return router;
    },

    seedBootstrapAdmin: async () => {
      await seedDefaultRoles.execute();

      const {
        BOOTSTRAP_ADMIN_EMPLOYEE_CODE,
        BOOTSTRAP_ADMIN_NAME,
        BOOTSTRAP_ADMIN_EMAIL,
        BOOTSTRAP_ADMIN_PHONE,
        BOOTSTRAP_ADMIN_PASSWORD,
      } = env;

      const input =
        BOOTSTRAP_ADMIN_EMPLOYEE_CODE &&
        BOOTSTRAP_ADMIN_NAME &&
        BOOTSTRAP_ADMIN_EMAIL &&
        BOOTSTRAP_ADMIN_PHONE &&
        BOOTSTRAP_ADMIN_PASSWORD
          ? {
              employeeCode: BOOTSTRAP_ADMIN_EMPLOYEE_CODE,
              name: BOOTSTRAP_ADMIN_NAME,
              email: BOOTSTRAP_ADMIN_EMAIL,
              phone: BOOTSTRAP_ADMIN_PHONE,
              password: BOOTSTRAP_ADMIN_PASSWORD,
            }
          : undefined;

      await seedBootstrapAdminUseCase.execute(input);
    },
  };
}
