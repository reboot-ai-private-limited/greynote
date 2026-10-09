import { Router } from 'express';
import { env } from '@/config/env.js';
import { ApproveDeviceUseCase } from './application/usecases/approveDevice.usecase.js';
import { ListPendingDevicesUseCase } from './application/usecases/listPendingDevices.usecase.js';
import { ListUserDevicesUseCase } from './application/usecases/listUserDevices.usecase.js';
import { LogoutDeviceUseCase } from './application/usecases/logoutDevice.usecase.js';
import { RejectDeviceUseCase } from './application/usecases/rejectDevice.usecase.js';
import { RemoveDeviceUseCase } from './application/usecases/removeDevice.usecase.js';
import { CreateDesignationUseCase } from './application/usecases/createDesignation.usecase.js';
import { PromotionPlanner } from './application/usecases/promotionPlanner.js';
import { ApplyDuePromotionsUseCase } from './application/usecases/applyDuePromotions.usecase.js';
import { CancelPromotionUseCase, ListAllPromotionsUseCase, ListPromotionsUseCase, PreviewPromotionUseCase, SchedulePromotionUseCase } from './application/usecases/promotions.usecase.js';
import { AssignCtcUseCase } from './application/usecases/assignCtc.usecase.js';
import { CreatePayComponentUseCase } from './application/usecases/createPayComponent.usecase.js';
import { GetCtcForMonthUseCase } from './application/usecases/getCtcForMonth.usecase.js';
import { ListCtcHistoryUseCase } from './application/usecases/listCtcHistory.usecase.js';
import { ListPayComponentsUseCase } from './application/usecases/listPayComponents.usecase.js';
import { PreviewCtcUseCase } from './application/usecases/previewCtc.usecase.js';
import { ReapplyCtcUseCase } from './application/usecases/reapplyCtc.usecase.js';
import { SeedDefaultPayComponentsUseCase } from './application/usecases/seedDefaultPayComponents.usecase.js';
import { UpdatePayComponentUseCase } from './application/usecases/updatePayComponent.usecase.js';
import { MongoCtcAssignmentAdapter } from './infrastructure/mongoCtcAssignment.adapter.js';
import { MongoPayComponentAdapter } from './infrastructure/mongoPayComponent.adapter.js';
import { makeCtcControllers } from './interface/ctc.controller.js';
import { buildCtcRouter, buildPayComponentsRouter, buildUserCtcRouter } from './interface/ctc.route.js';
import { CreatePayBandUseCase } from './application/usecases/createPayBand.usecase.js';
import { CreateRoleUseCase } from './application/usecases/createRole.usecase.js';
import {
  CreateEmployeeDraftUseCase,
  DeleteEmployeeDraftUseCase,
  GetEmployeeDraftUseCase,
  ListEmployeeDraftsUseCase,
  UpdateEmployeeDraftUseCase,
} from './application/usecases/employeeDrafts.usecase.js';
import { FinalizeEmployeeDraftUseCase, type HqAssigner } from './application/usecases/finalizeEmployeeDraft.usecase.js';
import { MongoEmployeeDraftAdapter } from './infrastructure/mongoEmployeeDraft.adapter.js';
import { MongoEmployeeCodeGenerator } from './infrastructure/mongoEmployeeCodeGenerator.adapter.js';
import { makeEmployeeDraftControllers } from './interface/employeeDrafts.controller.js';
import { buildEmployeeDraftsRouter } from './interface/employeeDrafts.route.js';
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
import { MongoManagerHistoryAdapter } from './infrastructure/mongoManagerHistory.adapter.js';
import { MongoPromotionAdapter } from './infrastructure/mongoPromotion.adapter.js';
import { MongoPayBandAdapter } from './infrastructure/mongoPayBand.adapter.js';
import { MongoRoleAdapter } from './infrastructure/mongoRole.adapter.js';
import { MongoUserAdapter } from './infrastructure/mongoUser.adapter.js';
import { MongoUserDeviceAdapter } from './infrastructure/mongoUserDevice.adapter.js';
import { MongoUserSessionAdapter } from './infrastructure/mongoUserSession.adapter.js';
import { businessDate } from '@/shared/time/businessTime.js';
import { MongooseTransactionRunner } from '@/shared/db/mongooseTransactionRunner.js';
import {
  makeLoginController,
  makeLogoutAllController,
  makeLogoutController,
  makeMeController,
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
import { makePromotionControllers } from './interface/promotions.controller.js';
import { buildPromotionsRouter, buildUserPromotionsRouter } from './interface/promotions.route.js';
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
  /** Writes the org's starting CTC formula if none exists yet. */
  seedPayComponents: () => Promise<void>;
  /** Applies every promotion whose month has come. The server calls it on start and hourly; safe at any time and from any number of servers. */
  applyDuePromotions: () => Promise<{ applied: number; failed: number }>;
  /** Territory sits above Identity, so the employee wizard's "set the HQ" is handed in once both are built. */
  bindHqAssigner: (assign: HqAssigner) => void;
  hasAdmin: () => Promise<boolean>;
  seedBootstrapAdmin: (input: BootstrapAdminInput) => Promise<void>;
}

export function buildIdentityContainer(configProvider: ConfigProviderPort): IdentityContainer {
  // 1. Adapters
  const roleRepository = new MongoRoleAdapter();
  const designationRepository = new MongoDesignationAdapter();
  const payBandRepository = new MongoPayBandAdapter();
  const payComponentRepository = new MongoPayComponentAdapter();
  const ctcAssignmentRepository = new MongoCtcAssignmentAdapter();
  const managerHistoryRepository = new MongoManagerHistoryAdapter();
  const promotionRepository = new MongoPromotionAdapter();
  /** The current month in the business timezone, read each time so a changed setting is honoured. */
  const currentMonth = async (): Promise<string> => businessDate(new Date(), await configProvider.get('BUSINESS_TIMEZONE')).slice(0, 7);
  const userRepository = new MongoUserAdapter();
  const employeeDraftRepository = new MongoEmployeeDraftAdapter();
  const employeeCodeGenerator = new MongoEmployeeCodeGenerator(userRepository);
  let hqAssigner: HqAssigner | null = null;
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
    userSessionRepository,
    managerHistoryRepository,
    currentMonth,
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

  const createPayBand = new CreatePayBandUseCase(payBandRepository);
  const listPayBands = new ListPayBandsUseCase(payBandRepository);
  const updatePayBand = new UpdatePayBandUseCase(payBandRepository);

  const listPayComponents = new ListPayComponentsUseCase(payComponentRepository);
  const createPayComponent = new CreatePayComponentUseCase(payComponentRepository);
  const updatePayComponent = new UpdatePayComponentUseCase(payComponentRepository);
  const seedDefaultPayComponents = new SeedDefaultPayComponentsUseCase(payComponentRepository);
  const previewCtc = new PreviewCtcUseCase(payComponentRepository);
  const assignCtc = new AssignCtcUseCase(userRepository, roleRepository, payComponentRepository, ctcAssignmentRepository, configProvider);
  const employeeDraftControllers = makeEmployeeDraftControllers({
    create: new CreateEmployeeDraftUseCase(employeeDraftRepository),
    list: new ListEmployeeDraftsUseCase(employeeDraftRepository),
    get: new GetEmployeeDraftUseCase(employeeDraftRepository),
    update: new UpdateEmployeeDraftUseCase(employeeDraftRepository),
    remove: new DeleteEmployeeDraftUseCase(employeeDraftRepository),
    finalize: new FinalizeEmployeeDraftUseCase(
      employeeDraftRepository,
      userRepository,
      designationRepository,
      employeeCodeGenerator,
      createUser,
      updateUser,
      assignCtc,
      ctcAssignmentRepository,
      passwordHasher,
      () => {
        if (!hqAssigner) throw new Error('The HQ assigner was not bound.');
        return hqAssigner;
      },
      currentMonth,
    ),
  });
  const listCtcHistory = new ListCtcHistoryUseCase(ctcAssignmentRepository);
  const getCtcForMonth = new GetCtcForMonthUseCase(ctcAssignmentRepository);
  const reapplyCtc = new ReapplyCtcUseCase(payComponentRepository, ctcAssignmentRepository);

  const promotionPlanner = new PromotionPlanner({
    users: userRepository,
    roles: roleRepository,
    designations: designationRepository,
    payBands: payBandRepository,
    profiles: employeeProfileRepository,
    components: payComponentRepository,
    assignments: ctcAssignmentRepository,
    promotions: promotionRepository,
    config: configProvider,
    currentMonth,
  });
  const previewPromotion = new PreviewPromotionUseCase(promotionPlanner);
  const schedulePromotion = new SchedulePromotionUseCase(promotionPlanner, promotionRepository, employeeProfileRepository);
  const listPromotions = new ListPromotionsUseCase(promotionPlanner, promotionRepository, userRepository);
  const listAllPromotions = new ListAllPromotionsUseCase(promotionPlanner, promotionRepository);
  const cancelPromotion = new CancelPromotionUseCase(promotionPlanner, promotionRepository);
  const applyDuePromotions = new ApplyDuePromotionsUseCase(promotionRepository, employeeProfileRepository, userRepository, payComponentRepository, ctcAssignmentRepository, managerHistoryRepository, currentMonth);

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
    me: makeMeController(getUserSummary),
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
  const ctcControllers = makeCtcControllers({ preview: previewCtc, assign: assignCtc, history: listCtcHistory, reapply: reapplyCtc });
  const promotionControllers = makePromotionControllers({ preview: previewPromotion, schedule: schedulePromotion, list: listPromotions, listAll: listAllPromotions, cancel: cancelPromotion, applyDue: applyDuePromotions });
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
      getCtcForMonth: (userId, month) => getCtcForMonth.execute(userId, month),
      getActiveDeviceCount: (userId) => getActiveDeviceCount.execute(userId),
    },

    buildRouter: () => {
      const router = Router();
      router.use('/auth', buildAuthRouter(authControllers));
      router.use(buildDevicesRouter(devicesControllers));
      router.use('/users', buildUserCtcRouter(ctcControllers));
      router.use('/users', buildUserPromotionsRouter(promotionControllers));
      router.use('/promotions', buildPromotionsRouter(promotionControllers));
      router.use('/employee-drafts', buildEmployeeDraftsRouter(employeeDraftControllers));
      router.use('/users', buildUsersRouter(usersControllers));
      router.use('/pay-components', buildPayComponentsRouter({ list: listPayComponents, create: createPayComponent, update: updatePayComponent }));
      router.use('/ctc', buildCtcRouter(ctcControllers));
      router.use('/roles', buildRolesRouter({ list: listRoles, create: createRole, update: updateRole }));
      router.use(
        '/designations',
        buildDesignationsRouter({ list: listDesignations, create: createDesignation }),
      );
      router.use(
        '/pay-bands',
        buildPayBandsRouter({ list: listPayBands, create: createPayBand, update: updatePayBand }),
      );
      return router;
    },

    seedRoles: () => seedDefaultRoles.execute(),
    seedPayComponents: () => seedDefaultPayComponents.execute(),
    applyDuePromotions: () => applyDuePromotions.execute(),
    bindHqAssigner: (assign) => {
      hqAssigner = assign;
    },
    hasAdmin: () => userRepository.existsAdmin(),
    seedBootstrapAdmin: (input) => seedBootstrapAdminUseCase.execute(input),
  };
}
