import { Router } from 'express';
import { env } from '@/config/env.js';
import { ApproveDeviceUseCase } from './application/usecases/approveDevice.usecase.js';
import { ListPendingDevicesUseCase } from './application/usecases/listPendingDevices.usecase.js';
import { ListUserDevicesUseCase } from './application/usecases/listUserDevices.usecase.js';
import { LogoutDeviceUseCase } from './application/usecases/logoutDevice.usecase.js';
import { RejectDeviceUseCase } from './application/usecases/rejectDevice.usecase.js';
import { RemoveDeviceUseCase } from './application/usecases/removeDevice.usecase.js';
import { CreateDesignationUseCase } from './application/usecases/createDesignation.usecase.js';
import { CreatePayBandUseCase } from './application/usecases/createPayBand.usecase.js';
import { CreateRoleUseCase } from './application/usecases/createRole.usecase.js';
import { CreateUserUseCase } from './application/usecases/createUser.usecase.js';
import { GetActiveDeviceCountUseCase } from './application/usecases/getActiveDeviceCount.usecase.js';
import { GetDirectReportsUseCase } from './application/usecases/getDirectReports.usecase.js';
import { GetDownlineUseCase } from './application/usecases/getDownline.usecase.js';
import { GetEmploymentDetailsUseCase } from './application/usecases/getEmploymentDetails.usecase.js';
import { GetManagerChainUseCase } from './application/usecases/getManagerChain.usecase.js';
import { GetPayBandRatesUseCase } from './application/usecases/getPayBandRates.usecase.js';
import { GetUserDetailUseCase } from './application/usecases/getUserDetail.usecase.js';
import { GetUserSummariesUseCase } from './application/usecases/getUserSummaries.usecase.js';
import { GetUserSummaryUseCase } from './application/usecases/getUserSummary.usecase.js';
import { BlockUserUseCase } from './application/usecases/blockUser.usecase.js';
import { IsBlockedUseCase } from './application/usecases/isBlocked.usecase.js';
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
import { ResetPasswordUseCase } from './application/usecases/resetPassword.usecase.js';
import type { BootstrapAdminInput } from './application/usecases/seedBootstrapAdmin.usecase.js';
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
import { MongoComplianceBlockAdapter } from './infrastructure/mongoComplianceBlock.adapter.js';
import { MongoDesignationAdapter } from './infrastructure/mongoDesignation.adapter.js';
import { MongoEmployeeProfileAdapter } from './infrastructure/mongoEmployeeProfile.adapter.js';
import { MongoPayBandAdapter } from './infrastructure/mongoPayBand.adapter.js';
import { MongoRoleAdapter } from './infrastructure/mongoRole.adapter.js';
import { MongoUserAdapter } from './infrastructure/mongoUser.adapter.js';
import { MongoUserDeviceAdapter } from './infrastructure/mongoUserDevice.adapter.js';
import { MongoUserSessionAdapter } from './infrastructure/mongoUserSession.adapter.js';
import { MongooseTransactionRunner } from '@/shared/db/mongooseTransactionRunner.js';
import {
  makeLoginController,
  makeLogoutAllController,
  makeLogoutController,
  makeRefreshController,
} from './interface/auth.controller.js';
import { buildAuthRouter } from './interface/auth.route.js';
import { buildDesignationsRouter } from './interface/designations.route.js';
import {
  makeApproveDeviceController,
  makeListPendingDevicesController,
  makeListUserDevicesController,
  makeLogoutDeviceController,
  makeRejectDeviceController,
  makeRemoveDeviceController,
} from './interface/devices.controller.js';
import { buildDevicesRouter } from './interface/devices.route.js';
import { buildPayBandsRouter } from './interface/payBands.route.js';
import { buildRolesRouter } from './interface/roles.route.js';
import {
  makeCreateUserController,
  makeGetUserDetailController,
  makeListUsersController,
  makeRemoveUserDocumentController,
  makeResetPasswordController,
  makeUnblockUserController,
  makeUpdateUserController,
  makeUploadUserDocumentController,
} from './interface/users.controller.js';
import { buildUsersRouter } from './interface/users.route.js';
import type { IdentityPublicContract } from './identity.public.js';

export interface IdentityContainer {
  contract: IdentityPublicContract;
  buildRouter: () => Router;
  /**
   * These three exist for `scripts/seed.ts` (a second composition root — see
   * `docs/engineering/module-anatomy.md`), never called from the HTTP boot path. Split apart
   * rather than one combined method so the script can check `hasAdmin()` BEFORE prompting an
   * operator for admin details, instead of prompting unconditionally and silently discarding
   * the input when one already exists.
   */
  seedRoles: () => Promise<void>;
  hasAdmin: () => Promise<boolean>;
  seedBootstrapAdmin: (input: BootstrapAdminInput) => Promise<void>;
}

export function buildIdentityContainer(configProvider: ConfigProviderPort): IdentityContainer {
  // 1. Adapters
  const roleRepository = new MongoRoleAdapter();
  const designationRepository = new MongoDesignationAdapter();
  const payBandRepository = new MongoPayBandAdapter();
  const userRepository = new MongoUserAdapter();
  const employeeProfileRepository = new MongoEmployeeProfileAdapter();
  const complianceBlockRepository = new MongoComplianceBlockAdapter();
  const userSessionRepository = new MongoUserSessionAdapter();
  const userDeviceRepository = new MongoUserDeviceAdapter();
  const passwordHasher = new BcryptPasswordHasher(env.BCRYPT_COST_FACTOR);
  const accessTokenSigner = new JwtAccessTokenSigner();
  const refreshTokenGenerator = new CryptoRefreshTokenGenerator();
  const documentStorage = new CloudinaryDocumentStorage();
  const transactionRunner = new MongooseTransactionRunner();

  const tokenOpts = {
    accessTokenTtlSeconds: env.JWT_ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlDays: env.JWT_REFRESH_TOKEN_TTL_DAYS,
  };

  // 2. Use cases
  const login = new LoginUseCase(
    userRepository,
    roleRepository,
    userSessionRepository,
    userDeviceRepository,
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

  const listPendingDevices = new ListPendingDevicesUseCase(userDeviceRepository, userRepository);
  const listUserDevices = new ListUserDevicesUseCase(userRepository, userDeviceRepository, userSessionRepository);
  const approveDevice = new ApproveDeviceUseCase(userDeviceRepository, configProvider);
  const rejectDevice = new RejectDeviceUseCase(userDeviceRepository, configProvider);
  const removeDevice = new RemoveDeviceUseCase(userDeviceRepository, userSessionRepository, transactionRunner);
  const logoutDevice = new LogoutDeviceUseCase(userDeviceRepository, userSessionRepository);

  const createUser = new CreateUserUseCase(userRepository, roleRepository, passwordHasher);
  const updateUser = new UpdateUserUseCase(
    userRepository,
    roleRepository,
    designationRepository,
    payBandRepository,
    employeeProfileRepository,
  );
  const listUsers = new ListUsersUseCase(userRepository, roleRepository, employeeProfileRepository);
  const uploadUserDocument = new UploadUserDocumentUseCase(userRepository, employeeProfileRepository, documentStorage);
  const removeUserDocument = new RemoveUserDocumentUseCase(employeeProfileRepository, documentStorage);
  const blockUser = new BlockUserUseCase(userRepository, roleRepository, complianceBlockRepository, transactionRunner);
  const unblockUser = new UnblockUserUseCase(userRepository, complianceBlockRepository, transactionRunner);
  const resetPassword = new ResetPasswordUseCase(userRepository, userSessionRepository, passwordHasher);
  const getUserDetail = new GetUserDetailUseCase(
    userRepository,
    roleRepository,
    employeeProfileRepository,
    complianceBlockRepository,
  );

  const createRole = new CreateRoleUseCase(roleRepository);
  const listRoles = new ListRolesUseCase(roleRepository);
  const updateRole = new UpdateRoleUseCase(roleRepository);

  const createDesignation = new CreateDesignationUseCase(designationRepository);
  const listDesignations = new ListDesignationsUseCase(designationRepository);
  const updateDesignation = new UpdateDesignationUseCase(designationRepository);

  const createPayBand = new CreatePayBandUseCase(payBandRepository);
  const listPayBands = new ListPayBandsUseCase(payBandRepository);
  const updatePayBand = new UpdatePayBandUseCase(payBandRepository);

  const getUserSummary = new GetUserSummaryUseCase(userRepository, roleRepository, employeeProfileRepository);
  const getManagerChain = new GetManagerChainUseCase(userRepository, roleRepository, employeeProfileRepository);
  const getUserSummaries = new GetUserSummariesUseCase(userRepository, roleRepository, employeeProfileRepository);
  const getDirectReports = new GetDirectReportsUseCase(userRepository, roleRepository, employeeProfileRepository);
  const getDownline = new GetDownlineUseCase(userRepository, roleRepository, employeeProfileRepository);
  const isFieldRole = new IsFieldRoleUseCase(userRepository, roleRepository);
  const isBlocked = new IsBlockedUseCase(userRepository);
  const getEmploymentDetails = new GetEmploymentDetailsUseCase(employeeProfileRepository);
  const getPayBandRates = new GetPayBandRatesUseCase(userRepository, employeeProfileRepository, payBandRepository);
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
    detail: makeGetUserDetailController(getUserDetail),
    create: makeCreateUserController(createUser),
    update: makeUpdateUserController(updateUser),
    uploadDocument: makeUploadUserDocumentController(uploadUserDocument),
    removeDocument: makeRemoveUserDocumentController(removeUserDocument),
    unblock: makeUnblockUserController(unblockUser),
    resetPassword: makeResetPasswordController(resetPassword),
  };
  const devicesControllers = {
    listPending: makeListPendingDevicesController(listPendingDevices),
    listForUser: makeListUserDevicesController(listUserDevices),
    approve: makeApproveDeviceController(approveDevice),
    reject: makeRejectDeviceController(rejectDevice),
    remove: makeRemoveDeviceController(removeDevice),
    logout: makeLogoutDeviceController(logoutDevice),
  };

  return {
    contract: {
      login: (input) => login.execute(input),
      refresh: (refreshToken) => refreshSession.execute(refreshToken),
      logout: (callerUserId, refreshToken) => logout.execute(callerUserId, refreshToken),
      getUserSummary: (userId) => getUserSummary.execute(userId),
      getUserSummaries: (userIds) => getUserSummaries.execute(userIds),
      findUserSummary: async (userId) =>
        (await userRepository.findById(userId)) ? getUserSummary.execute(userId) : null,
      getManagerChain: (userId) => getManagerChain.execute(userId),
      getDirectReports: (managerId) => getDirectReports.execute(managerId),
      getDownline: (managerId) => getDownline.execute(managerId),
      isFieldRole: (userId) => isFieldRole.execute(userId),
      isBlocked: (userId) => isBlocked.execute(userId),
      blockUser: (userId, reason) => blockUser.execute(userId, reason),
      listActiveFieldUserIds: () => userRepository.listActiveIdsByRole('FIELD'),
      getLastBlockClearedAt: (userId) => complianceBlockRepository.findLastClearedAt(userId),
      getEmploymentDetails: (userId) => getEmploymentDetails.execute(userId),
      listPayBands: async () => (await listPayBands.execute()).map(({ id, name }) => ({ id, name })),
      getPayBandRates: (userId) => getPayBandRates.execute(userId),
      getActiveDeviceCount: (userId) => getActiveDeviceCount.execute(userId),
    },

    buildRouter: () => {
      const router = Router();
      router.use('/auth', buildAuthRouter(authControllers));
      router.use(buildDevicesRouter(devicesControllers));
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

    seedRoles: () => seedDefaultRoles.execute(),
    hasAdmin: () => userRepository.existsAdmin(),
    seedBootstrapAdmin: (input) => seedBootstrapAdminUseCase.execute(input),
  };
}
